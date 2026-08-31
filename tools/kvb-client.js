/**
 * Layer 3: KVB Live Client (HAFAS Integration & Live-Radar)
 * Source of Truth: auskunft.kvb.koeln / HAFAS REST Gate
 * Focused strictly on KVB Stadtbahn & KVB Bus (S-Bahn and DB regional trains excluded)
 */
import { createClient } from 'hafas-client';
import baseProfile from 'hafas-client/p/kvb/base.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Agent } from 'https';
import { VERIFIED_STATIONS, MAJOR_HUBS, getLineColor } from './stations-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve SSL certificates safely across OS environments
const caCertPath = join(__dirname, '../node_modules/hafas-client/p/kvb/thawte-tls-rsa-ca-g1.crt.pem');
const rootCertPath = join(__dirname, '../node_modules/hafas-client/p/kvb/digicert-global-root-g2.crt.pem');

const ca = readFileSync(caCertPath, 'utf8');
const root = readFileSync(rootCertPath, 'utf8');
const httpsAgent = new Agent({
  ca: ca + '\n' + root,
  keepAlive: true
});

const products = [
  { id: 'stadtbahn', mode: 'train', bitmasks: [2], name: 'Stadtbahn', short: 'Stadtbahn', default: true },
  { id: 'bus', mode: 'bus', bitmasks: [8], name: 'Bus', short: 'Bus', default: true },
  { id: 'taxibus', mode: 'bus', bitmasks: [256], name: 'Taxibus', short: 'Taxibus', default: true }
];

const customProfile = {
  ...baseProfile,
  transformReq: (ctx, req) => ({
    ...req,
    agent: httpsAgent
  }),
  locale: 'de-DE',
  timezone: 'Europe/Berlin',
  products,
  radar: true,
  trip: true
};

export const hafasClient = createClient(customProfile, 'koeln-live-monitor/2.0');

/**
 * 6-Second Timeout Wrapper for external HAFAS calls
 */
export function withTimeout(promise, ms = 6000, opName = 'KVB HAFAS') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${opName} Timeout nach ${ms}ms`));
      }, ms);
      if (typeof timer.unref === 'function') timer.unref();
    })
  ]);
}

const VALID_STADTBAHN_NUMBERS = new Set(['1', '3', '4', '5', '7', '9', '12', '13', '15', '16', '17', '18']);

/**
 * Live-Radar: Echtzeit-Fahrzeug-Tracking für KVB Stadtbahnen & KVB Busse in Köln
 */
export async function getLiveRadar(bounds = null, productFilter = 'all') {
  const defaultBounds = {
    north: 51.08,
    west: 6.78,
    south: 50.84,
    east: 7.15
  };
  const b = bounds || defaultBounds;

  try {
    const radarData = await withTimeout(
      hafasClient.radar(b, {
        results: 350,
        duration: 15,
        frames: 1
      }),
      6000,
      'KVB HAFAS Radar'
    );

    const rawMovements = radarData.movements || [];
    const now = new Date();

    const allVehicles = [];

    for (const m of rawMovements) {
      if (!m.location?.latitude || !m.location?.longitude) continue;

      const rawLine = m.line?.name || m.line?.symbol || '';
      const cleanNum = rawLine.replace(/^(LINIE|STADTBAHN|STRASSENBAHN|BUS|SB)\s*/i, '').trim();

      // Exclude DB S-Bahn, Regionalzüge, Fernverkehr
      if (rawLine.startsWith('S') || /^(S\d+|RB\d+|RE\d+|ICE|IC|EC)/i.test(rawLine)) {
        continue;
      }

      let mode = 'stadtbahn';
      let isMatch = false;

      if (VALID_STADTBAHN_NUMBERS.has(cleanNum)) {
        mode = 'stadtbahn';
        isMatch = true;
      } else if (/^\d{3}$/.test(cleanNum) || rawLine.startsWith('SB') || rawLine.toLowerCase().includes('bus') || m.line?.product === 'bus') {
        mode = 'bus';
        isMatch = true;
      }

      if (!isMatch) continue;

      // Filter by requested product
      if (productFilter === 'stadtbahn' && mode !== 'stadtbahn') continue;
      if (productFilter === 'bus' && mode !== 'bus') continue;

      const col = getLineColor(cleanNum || rawLine);

      // Next stopover details
      const nextStop = m.nextStopovers && m.nextStopovers[0] ? {
        id: m.nextStopovers[0].stop?.id,
        name: m.nextStopovers[0].stop?.name?.replace(/^(Köln|Frechen|Hürth|Brühl|Bonn)\s*,?\s*/i, ''),
        fullName: m.nextStopovers[0].stop?.name,
        plannedArrival: m.nextStopovers[0].plannedArrival,
        arrival: m.nextStopovers[0].arrival || m.nextStopovers[0].plannedArrival,
        delayMinutes: m.nextStopovers[0].arrival && m.nextStopovers[0].plannedArrival ? 
          Math.max(0, Math.round((new Date(m.nextStopovers[0].arrival) - new Date(m.nextStopovers[0].plannedArrival)) / 60000)) : 0
      } : null;

      allVehicles.push({
        tripId: m.tripId,
        line: cleanNum || rawLine,
        lineName: mode === 'stadtbahn' ? `Linie ${cleanNum}` : `Bus ${cleanNum || rawLine}`,
        product: mode,
        mode,
        direction: m.direction || 'Köln',
        lat: m.location.latitude,
        lng: m.location.longitude,
        lineColor: col.bg,
        lineTextColor: col.text,
        nextStop
      });
    }

    const stadtbahnCount = allVehicles.filter(v => v.mode === 'stadtbahn').length;
    const busCount = allVehicles.filter(v => v.mode === 'bus').length;

    return {
      timestamp: now.toISOString(),
      source: 'KVB HAFAS Radar',
      status: 'live',
      lastSuccessfulUpdate: now.toISOString(),
      count: allVehicles.length,
      stadtbahnCount,
      busCount,
      totalCount: allVehicles.length,
      vehicles: allVehicles
    };
  } catch (err) {
    console.error('Radar fetch error:', err.message);
    return {
      timestamp: new Date().toISOString(),
      source: 'KVB HAFAS Radar',
      status: 'error',
      count: 0,
      stadtbahnCount: 0,
      busCount: 0,
      totalCount: 0,
      vehicles: [],
      error: err.message,
      lastSuccessfulUpdate: null
    };
  }
}

/**
 * Haltestellensuche mit Autovervollständigung (100% verifiziert)
 */
export async function searchStations(query) {
  if (!query || query.trim().length === 0) {
    return VERIFIED_STATIONS.filter(s => MAJOR_HUBS.includes(s.id));
  }

  const q = query.trim().toLowerCase();
  
  // 1. Search in local verified stations
  const localMatches = VERIFIED_STATIONS.filter(s => 
    s.name.toLowerCase().includes(q) || 
    s.short.toLowerCase().includes(q)
  );

  // 2. Query HAFAS for additional stops
  try {
    const hafasResults = await withTimeout(
      hafasClient.locations(query, {
        results: 10,
        stops: true,
        addresses: false,
        poi: false
      }),
      6000,
      'KVB HAFAS Locations'
    );

    const hafasStops = (hafasResults || [])
      .filter(loc => loc.type === 'stop' || loc.type === 'station')
      .map(loc => ({
        id: loc.id,
        name: loc.name,
        short: loc.name.replace(/^(Köln|Frechen|Hürth|Brühl|Bonn|Bergisch Gladbach|Leverkusen)\s*,?\s*/i, ''),
        lat: loc.location?.latitude,
        lng: loc.location?.longitude,
        lines: [],
        isMajor: MAJOR_HUBS.includes(loc.id)
      }));

    const map = new Map();
    localMatches.forEach(s => map.set(s.id, { ...s, isMajor: MAJOR_HUBS.includes(s.id) }));
    hafasStops.forEach(s => {
      if (!map.has(s.id)) map.set(s.id, s);
    });

    const results = Array.from(map.values());
    results.sort((a, b) => {
      const aKoeln = a.name.startsWith('Köln');
      const bKoeln = b.name.startsWith('Köln');
      if (aKoeln && !bKoeln) return -1;
      if (!aKoeln && bKoeln) return 1;
      if (a.isMajor && !b.isMajor) return -1;
      if (!a.isMajor && b.isMajor) return 1;
      return 0;
    });

    return results.slice(0, 15);
  } catch (err) {
    console.warn('HAFAS location search fallback to local stations:', err.message);
    return localMatches.slice(0, 15);
  }
}

/**
 * Live-Abfahrtstafel (KVB Stadtbahn & Bus minutengenau)
 */
export async function getDepartures(stopId) {
  if (!stopId) throw new Error('stopId is required');

  let stationInfo = VERIFIED_STATIONS.find(s => s.id === stopId);
  const now = new Date();

  try {
    const res = await withTimeout(
      hafasClient.departures(stopId, {
        duration: 60,
        results: 45,
        remarks: true
      }),
      6000,
      'KVB HAFAS Departures'
    );

    const rawDepartures = res.departures || res || [];
    const stopName = stationInfo ? stationInfo.name : (res.stop?.name || `Haltestelle (${stopId})`);

    const departures = [];

    for (const dep of rawDepartures) {
      const rawLine = dep.line?.name || dep.line?.symbol || '';
      
      // Exclude DB S-Bahn, RE, RB, ICE
      if (rawLine.startsWith('S') || /^(S\d+|RB\d+|RE\d+|ICE|IC|EC)/i.test(rawLine)) {
        continue;
      }

      const cleanNum = rawLine.replace(/^(LINIE|STADTBAHN|STRASSENBAHN|BUS|SB)\s*/i, '').trim();
      let mode = 'stadtbahn';
      if (/^\d{3}$/.test(cleanNum) || rawLine.startsWith('SB') || rawLine.toLowerCase().includes('bus') || dep.line?.product === 'bus') {
        mode = 'bus';
      }

      const planned = dep.plannedWhen ? new Date(dep.plannedWhen) : (dep.when ? new Date(dep.when) : now);
      const actual = dep.when ? new Date(dep.when) : planned;
      const diffMs = actual.getTime() - now.getTime();
      const minutesUntil = Math.max(0, Math.round(diffMs / 60000));
      
      let delayMinutes = 0;
      if (dep.delay !== undefined && dep.delay !== null) {
        delayMinutes = Math.round(dep.delay / 60);
      } else if (dep.when && dep.plannedWhen) {
        delayMinutes = Math.max(0, Math.round((new Date(dep.when) - new Date(dep.plannedWhen)) / 60000));
      }

      const colorInfo = getLineColor(cleanNum || rawLine);
      const plannedTimeStr = planned.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      const timeMinutesStr = minutesUntil === 0 ? 'Jetzt' : (minutesUntil < 60 ? `in ${minutesUntil} Min.` : plannedTimeStr);

      departures.push({
        tripId: dep.tripId,
        line: cleanNum || rawLine,
        lineName: mode === 'stadtbahn' ? `Linie ${cleanNum}` : `Bus ${cleanNum || rawLine}`,
        product: mode,
        mode,
        direction: dep.direction || 'Unbekannt',
        destination: dep.direction || 'Unbekannt',
        plannedWhen: planned.toISOString(),
        plannedTime: plannedTimeStr,
        when: actual.toISOString(),
        timeMinutes: timeMinutesStr,
        delayMinutes,
        minutesUntil,
        platform: dep.platform || dep.plannedPlatform || null,
        cancelled: Boolean(dep.cancelled),
        remarks: (dep.remarks || []).map(r => r.text || r.summary).filter(Boolean),
        lineColor: colorInfo.bg,
        lineTextColor: colorInfo.text
      });
    }

    departures.sort((a, b) => new Date(a.when) - new Date(b.when));

    return {
      stop: {
        id: stopId,
        name: stopName,
        short: stationInfo ? stationInfo.short : stopName.replace(/^(Köln|Frechen|Hürth|Brühl|Bonn)\s*,?\s*/i, ''),
        lat: stationInfo?.lat || res.stop?.location?.latitude,
        lng: stationInfo?.lng || res.stop?.location?.longitude,
        lines: stationInfo?.lines || []
      },
      timestamp: now.toISOString(),
      source: 'KVB HAFAS',
      status: 'live',
      lastSuccessfulUpdate: now.toISOString(),
      departures
    };
  } catch (err) {
    console.warn(`HAFAS departures fetch error for ${stopId}:`, err.message);
    return {
      stop: {
        id: stopId,
        name: stationInfo ? stationInfo.name : `Haltestelle (${stopId})`,
        short: stationInfo ? stationInfo.short : `Haltestelle (${stopId})`,
        lat: stationInfo?.lat || 50.9380,
        lng: stationInfo?.lng || 6.9580,
        lines: stationInfo?.lines || []
      },
      timestamp: now.toISOString(),
      source: 'KVB HAFAS',
      status: 'error',
      departures: [],
      error: err.message,
      lastSuccessfulUpdate: null
    };
  }
}

/**
 * KVB Live-Routenplaner ("Von A nach B" per KVB Stadtbahn & Bus)
 */
export async function getRoutes(fromQuery, toQuery, when = new Date()) {
  if (!fromQuery || !toQuery) throw new Error('from and to parameters are required');

  let fromId = fromQuery;
  let toId = toQuery;

  if (!/^\d+$/.test(fromQuery)) {
    const fromResults = await searchStations(fromQuery);
    if (!fromResults.length) throw new Error(`Start-Haltestelle nicht gefunden: ${fromQuery}`);
    fromId = fromResults[0].id;
  }

  if (!/^\d+$/.test(toQuery)) {
    const toResults = await searchStations(toQuery);
    if (!toResults.length) throw new Error(`Ziel-Haltestelle nicht gefunden: ${toQuery}`);
    toId = toResults[0].id;
  }

  const journeyRes = await withTimeout(
    hafasClient.journeys(fromId, toId, {
      departure: when,
      results: 5,
      transfers: 5,
      remarks: true
    }),
    6000,
    'KVB HAFAS Journeys'
  );

  const rawJourneys = journeyRes.journeys || [];
  
  const fromInfo = VERIFIED_STATIONS.find(s => s.id === fromId) || { id: fromId, name: fromQuery };
  const toInfo = VERIFIED_STATIONS.find(s => s.id === toId) || { id: toId, name: toQuery };

  const routes = rawJourneys.map(j => {
    const depTime = new Date(j.legs[0].departure || j.legs[0].plannedDeparture);
    const arrTime = new Date(j.legs[j.legs.length - 1].arrival || j.legs[j.legs.length - 1].plannedArrival);
    const durationMinutes = Math.round((arrTime.getTime() - depTime.getTime()) / 60000);

    const legs = j.legs.map(leg => {
      if (leg.walking || leg.type === 'walking') {
        return {
          type: 'walking',
          walking: true,
          origin: leg.origin?.name || 'Haltestelle',
          destination: leg.destination?.name || 'Haltestelle',
          durationMinutes: Math.round((new Date(leg.arrival).getTime() - new Date(leg.departure).getTime()) / 60000) || 1
        };
      }

      const rawLine = leg.line?.name || leg.line?.symbol || 'Bahn';
      const cleanNum = rawLine.replace(/^(LINIE|STADTBAHN|STRASSENBAHN|BUS|SB)\s*/i, '').trim();
      let mode = 'stadtbahn';
      if (/^\d{3}$/.test(cleanNum) || rawLine.startsWith('SB') || rawLine.toLowerCase().includes('bus') || leg.line?.product === 'bus') {
        mode = 'bus';
      }

      const col = getLineColor(cleanNum || rawLine);

      let delayMinutes = 0;
      if (leg.departure && leg.plannedDeparture) {
        delayMinutes = Math.max(0, Math.round((new Date(leg.departure) - new Date(leg.plannedDeparture)) / 60000));
      }

      return {
        type: 'transit',
        walking: false,
        line: cleanNum || rawLine,
        product: mode,
        mode,
        direction: leg.direction || leg.destination?.name || '',
        origin: leg.origin?.name || '',
        destination: leg.destination?.name || '',
        departure: leg.departure || leg.plannedDeparture,
        plannedDeparture: leg.plannedDeparture,
        arrival: leg.arrival || leg.plannedArrival,
        plannedArrival: leg.plannedArrival,
        departurePlatform: leg.departurePlatform || leg.plannedDeparturePlatform || null,
        arrivalPlatform: leg.arrivalPlatform || leg.plannedArrivalPlatform || null,
        delayMinutes,
        lineColor: col.bg,
        lineTextColor: col.text
      };
    });

    const transferCount = legs.filter(l => l.type === 'transit').length - 1;

    return {
      durationMinutes,
      departure: depTime.toISOString(),
      departureTime: depTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      arrival: arrTime.toISOString(),
      arrivalTime: arrTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      transfers: Math.max(0, transferCount),
      legs
    };
  });

  return {
    from: fromInfo,
    to: toInfo,
    timestamp: new Date().toISOString(),
    routes
  };
}
