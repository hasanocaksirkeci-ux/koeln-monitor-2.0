/**
 * Köln Live-Monitor & City-Plattform: Server & REST API
 * Layer 2: Navigation & Controller
 */
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { searchStations, getDepartures, getRoutes, getLiveRadar } from './tools/kvb-client.js';
import { getDisruptions } from './tools/kvb-disruptions.js';
import { getCologneWidgets } from './tools/cologne-widgets.js';
import { getLineTracks, VERIFIED_STATIONS, findStation, getJourneyTrackGeometry } from './tools/stations-data.js';
import { fetchCologneEmergencies } from './tools/cologne-emergencies.js';
import { fetchKvbBikes } from './tools/kvb-bikes.js';
import { computeNetworkAnalytics } from './tools/analytics.js';
import { getSavedRoutes, addSavedRoute, getEmergenciesFromDB } from './tools/db.js';
import { getTomTomTrafficConfig, fetchTomTomIncidents } from './tools/tomtom-traffic.js';
import { geocodePlace, calculateDrivingRoute } from './tools/tomtom-routing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env automatically if present
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  } else {
    const envPath = join(__dirname, '.env');
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, 'utf8');
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [k, ...v] = trimmed.split('=');
          if (k && v.length > 0) {
            process.env[k.trim()] = v.join('=').trim();
          }
        }
      });
    }
  }
} catch (e) {
  // Ignore env loading errors
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Resilient in-memory cache with Thundering-Herd Promise Sharing
const cache = new Map();
function getCached(key, ttlSeconds, fetcher) {
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.data !== undefined && (now - cached.timestamp < ttlSeconds * 1000)) {
    return Promise.resolve(cached.data);
  }
  // If an upstream request is already in-flight for this key, reuse the existing promise
  if (cached && cached.promise) {
    return cached.promise;
  }

  const promise = (async () => {
    try {
      const data = await fetcher();
      cache.set(key, { timestamp: Date.now(), data, promise: null });
      return data;
    } catch (err) {
      if (cached && cached.data !== undefined) {
        cache.set(key, { timestamp: cached.timestamp, data: cached.data, promise: null });
      } else {
        cache.delete(key);
      }
      throw err;
    }
  })();

  cache.set(key, {
    timestamp: cached?.timestamp || 0,
    data: cached?.data,
    promise
  });

  return promise;
}

// ----------------------------------------------------
// REST API Endpoints
// ----------------------------------------------------

/**
 * GET /api/stations?q=...
 * Search stations with autocomplete or get major Cologne hubs
 */
app.get('/api/stations', async (req, res) => {
  try {
    const query = req.query.q || '';
    const stations = await searchStations(query);
    res.json({ stations });
  } catch (err) {
    console.error('Error in /api/stations:', err.message);
    res.status(500).json({ error: err.message, stations: [] });
  }
});

/**
 * GET /api/lines?mode=all|stadtbahn|bus
 * Returns all KVB Stadtbahn & Bus line tracks with coordinates for the map
 */
app.get('/api/lines', (req, res) => {
  try {
    const mode = req.query.mode || 'all';
    const lines = getLineTracks(mode);
    const stadtbahn = lines.filter(l => l.mode === 'stadtbahn' || l.routeType === 'stadtbahn');
    const bus = lines.filter(l => l.mode === 'bus' || l.routeType === 'bus');
    res.json({ lines, stadtbahn, bus, stations: VERIFIED_STATIONS });
  } catch (err) {
    console.error('Error in /api/lines:', err.message);
    res.status(500).json({ error: err.message, lines: [], stadtbahn: [], bus: [], stations: [] });
  }
});

/**
 * GET /api/radar?product=...&mode=...&north=...&west=...&south=...&east=...
 * Returns real-time GPS locations of moving transit vehicles in Cologne (Stadtbahnen & Busse)
 */
app.get('/api/radar', async (req, res) => {
  try {
    const product = req.query.mode || req.query.product || 'all';
    let bounds = null;
    if (req.query.north && req.query.west && req.query.south && req.query.east) {
      bounds = {
        north: parseFloat(req.query.north),
        west: parseFloat(req.query.west),
        south: parseFloat(req.query.south),
        east: parseFloat(req.query.east)
      };
    }

    const cacheKey = `radar_${product}_${req.query.north || 'def'}`;
    // Cache radar for 4 seconds
    const data = await getCached(cacheKey, 4, () => getLiveRadar(bounds, product));
    res.json(data);
  } catch (err) {
    console.error('Error in /api/radar:', err.message);
    res.status(500).json({ error: err.message, count: 0, stadtbahnCount: 0, busCount: 0, totalCount: 0, vehicles: [] });
  }
});

/**
 * GET /api/emergencies?q=...&district=...&category=...
 * Live Polizei & Feuerwehr Köln incident reports with Veedel geocoding
 */
app.get('/api/emergencies', async (req, res) => {
  try {
    const { q, district, category } = req.query;
    if (q || district || category) {
      const results = getEmergenciesFromDB({ query: q, district, category, limit: 50 });
      return res.json({
        timestamp: new Date().toISOString(),
        count: results.length,
        emergencies: results
      });
    }

    // Default: fetch live feed & return recent
    const data = await getCached('cologne_emergencies', 60, () => fetchCologneEmergencies());
    res.json(data);
  } catch (err) {
    console.error('Error in /api/emergencies:', err.message);
    res.status(500).json({ error: err.message, count: 0, emergencies: [] });
  }
});

/**
 * GET /api/bikes
 * Live KVB Rad / Nextbike stations and available bikes in Cologne
 */
app.get('/api/bikes', async (req, res) => {
  try {
    const data = await getCached('kvb_bikes', 60, () => fetchKvbBikes());
    res.json(data);
  } catch (err) {
    console.error('Error in /api/bikes:', err.message);
    res.status(500).json({ error: err.message, totalStations: 0, totalAvailableBikes: 0, stations: [] });
  }
});

/**
 * GET /api/analytics
 * Real-time network punctuality score & line delay metrics
 */
app.get('/api/analytics', async (req, res) => {
  try {
    const data = await getCached('cologne_analytics', 20, () => computeNetworkAnalytics());
    res.json(data);
  } catch (err) {
    console.error('Error in /api/analytics:', err.message);
    res.status(500).json({ error: err.message, punctualityScore: 0, totalTracked: 0 });
  }
});

/**
 * GET /api/saved-routes
 * Retrieve saved commuter routes from SQLite
 */
app.get('/api/saved-routes', (req, res) => {
  try {
    const routes = getSavedRoutes();
    res.json({ routes });
  } catch (err) {
    console.error('Error in /api/saved-routes:', err.message);
    res.status(500).json({ error: err.message, routes: [] });
  }
});

/**
 * POST /api/saved-routes
 * Save a commuter route into SQLite
 */
app.post('/api/saved-routes', (req, res) => {
  try {
    const { fromName, fromId, toName, toId, name } = req.body;
    if (!fromName || !toName) {
      return res.status(400).json({ error: 'fromName und toName sind erforderlich' });
    }
    const updated = addSavedRoute(fromName, fromId, toName, toId, name);
    res.json({ success: true, routes: updated });
  } catch (err) {
    console.error('Error in POST /api/saved-routes:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/departures?stopId=...
 * Live departure board for a specific station (minutengenau, Gleise, Verspätung)
 */
app.get('/api/departures', async (req, res) => {
  try {
    const stopId = req.query.stopId;
    if (!stopId) {
      return res.status(400).json({ error: 'Parameter stopId ist erforderlich' });
    }
    const data = await getCached(`deps_${stopId}`, 15, () => getDepartures(stopId));
    res.json(data);
  } catch (err) {
    console.error('Error in /api/departures:', err.message);
    res.status(500).json({ error: err.message, departures: [] });
  }
});

/**
 * GET /api/routes?from=...&to=...
 * KVB Live-Routenplaner ("Von A nach B")
 */
app.get('/api/routes', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Parameter from und to sind erforderlich' });
    }
    const cacheKey = `route_${from}_${to}`;
    const data = await getCached(cacheKey, 20, async () => {
      const journeys = await getRoutes(from, to);
      // Real, per-leg-sliced geometry for the "Trasse auf Karte zeichnen"
      // button, computed from each journey option's OWN actual legs
      // (real line + real origin/destination per leg, including the real
      // transfer point) - not a from-scratch guess at a hub transfer for
      // the overall from/to pair, which could disagree with the journey
      // actually shown (wrong start point, ignored transfer). Different
      // route options can have different transfers, so this is computed
      // per option, not once for the whole from/to pair.
      const routesWithTrack = (journeys.routes || []).map(route => {
        const track = getJourneyTrackGeometry(route.legs);
        return {
          ...route,
          trackGeometry: track && track.coordinates && track.coordinates.length > 1 ? track : null
        };
      });
      return { ...journeys, routes: routesWithTrack };
    });
    res.json(data);
  } catch (err) {
    console.error('Error in /api/routes:', err.message);
    res.status(500).json({ error: err.message, routes: [] });
  }
});

/**
 * GET /api/routes/drive?from=...&to=...&mode=car|bicycle|pedestrian
 * Auto/Rad/Fußgänger-Routenplaner ("Von A nach B") via TomTom Routing.
 * Resolves from/to against known KVB stations first, then falls back to
 * TomTom Geocoding for free-text addresses. Never fabricates geometry -
 * an unresolved point or failed routing call returns an explicit
 * unavailable/error status instead of a fake line.
 */
app.get('/api/routes/drive', async (req, res) => {
  try {
    const { from, to } = req.query;
    const mode = ['car', 'bicycle', 'pedestrian'].includes(req.query.mode) ? req.query.mode : 'car';
    if (!from || !to) {
      return res.status(400).json({ error: 'Parameter from und to sind erforderlich' });
    }

    const cacheKey = `route_drive_${mode}_${from}_${to}`;
    const data = await getCached(cacheKey, 30, async () => {
      const resolvePoint = async (query) => {
        const station = findStation(query);
        if (station) return { lat: station.lat, lng: station.lng, label: station.name || station.short };
        return geocodePlace(query);
      };

      const [fromPoint, toPoint] = await Promise.all([resolvePoint(from), resolvePoint(to)]);
      if (!fromPoint || !toPoint) {
        return {
          status: 'error',
          error: !fromPoint && !toPoint
            ? `Start "${from}" und Ziel "${to}" konnten nicht gefunden werden`
            : (!fromPoint ? `Start "${from}" konnte nicht gefunden werden` : `Ziel "${to}" konnte nicht gefunden werden`),
          coordinates: []
        };
      }

      const route = await calculateDrivingRoute(fromPoint, toPoint, mode);
      if (!route || route.status === 'unconfigured') {
        return { status: 'unconfigured', configured: false, error: 'TomTom API-Key nicht konfiguriert', coordinates: [] };
      }
      if (!route.coordinates || route.coordinates.length < 2) {
        return { status: 'error', error: route.error || 'Keine Streckengeometrie gefunden', coordinates: [] };
      }

      return {
        status: 'ok',
        mode,
        from: fromPoint,
        to: toPoint,
        coordinates: route.coordinates,
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        source: 'tomtom-routing',
        timestamp: new Date().toISOString()
      };
    });

    res.json(data);
  } catch (err) {
    console.error('Error in /api/routes/drive:', err.message);
    res.status(500).json({ error: err.message, coordinates: [] });
  }
});

/**
 * GET /api/disruptions
 * Official KVB Betriebslage / Disruptions & SEV with Traffic Light statuses
 */
app.get('/api/disruptions', async (req, res) => {
  try {
    const data = await getCached('kvb_disruptions', 60, () => getDisruptions());
    res.json(data);
  } catch (err) {
    console.error('Error in /api/disruptions:', err.message);
    res.status(500).json({ error: err.message, summary: { total: 0, severe: 0, warning: 0 }, lines: [] });
  }
});

/**
 * GET /api/widgets
 * Cologne City Widgets: Rheinpegel, Parkhaussystem, Wetter
 */
app.get('/api/widgets', async (req, res) => {
  try {
    const data = await getCached('cologne_widgets', 120, () => getCologneWidgets());
    res.json(data);
  } catch (err) {
    console.error('Error in /api/widgets:', err.message);
    res.status(500).json({ error: err.message, pegel: null, parking: [], weather: null });
  }
});

/**
 * GET /api/traffic/config
 * Returns TomTom Traffic tile URLs and status
 */
app.get('/api/traffic/config', (req, res) => {
  try {
    const config = getTomTomTrafficConfig();
    res.json(config);
  } catch (err) {
    console.error('Error in /api/traffic/config:', err.message);
    res.status(500).json({ error: err.message, configured: false });
  }
});

/**
 * GET /api/traffic/incidents
 * Real-time traffic jams, roadworks and bridge congestion in Cologne
 */
app.get('/api/traffic/incidents', async (req, res) => {
  try {
    const data = await getCached('tomtom_incidents', 45, () => fetchTomTomIncidents());
    res.json(data);
  } catch (err) {
    console.error('Error in /api/traffic/incidents:', err.message);
    res.status(500).json({ error: err.message, count: 0, incidents: [] });
  }
});

import { queryCologneAI } from './tools/cologne-ai.js';
import { canvaService } from './tools/canva-connect.js';

/**
 * GET /api/canva/status
 */
app.get('/api/canva/status', (req, res) => {
  res.json(canvaService.getStatus());
});

/**
 * POST /api/ai/query
 * Intelligent AI City & Transit Concierge
 */
app.post('/api/ai/query', async (req, res) => {
  try {
    const { prompt, model } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt ist erforderlich' });
    }
    const result = await queryCologneAI(prompt, { model });
    res.json(result);
  } catch (err) {
    console.error('Error in /api/ai/query:', err.message);
    res.status(500).json({ error: err.message, answer: 'Entschuldigung, der KI-Dienst ist vorübergehend nicht erreichbar.' });
  }
});

/**
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Single Page Application Fallback
app.use((req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Start Server locally if run directly
const isDirectRun = process.argv[1] && (process.argv[1] === __filename || process.argv[1].endsWith('server.js'));
if (isDirectRun && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Köln Live-Monitor City-Plattform läuft auf http://localhost:${PORT}`);
    console.log(`🗺️  Live-Karte: http://localhost:${PORT}`);
    console.log(`🚨 Blaulicht & Einsätze: http://localhost:${PORT}/api/emergencies`);
    console.log(`🚲 KVB-Rad Live: http://localhost:${PORT}/api/bikes`);
    console.log(`📊 Pünktlichkeit & Analytics: http://localhost:${PORT}/api/analytics`);
    console.log(`====================================================`);
  });
}

export default app;
