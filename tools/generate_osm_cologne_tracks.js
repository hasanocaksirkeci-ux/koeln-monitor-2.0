/**
 * High-Precision KVB Stadtbahn & Bus Track Generator
 * Generates continuous railway & bus coordinates with subway tunnel tubes and bridge alignments
 * 100% KVB (Linien 1, 3, 4, 5, 7, 9, 12, 13, 15, 16, 17, 18 & KVB Hauptbuslinien)
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { saveTransitTracks } from './db.js';
import { LINE_ROUTES, BUS_ROUTES, LINE_COLORS, TUNNEL_STOP_NAMES } from './stations-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');
const OUT_FILE = join(DATA_DIR, 'koeln_osm_tracks.json');

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Load verified stations
const stations = JSON.parse(readFileSync(join(__dirname, 'verified_stations.json'), 'utf8'));

function findStationByNameOrId(q) {
  if (!q) return null;
  const clean = String(q).toLowerCase().trim();
  return stations.find(s => 
    s.id === clean || 
    s.name.toLowerCase() === clean || 
    (s.short && s.short.toLowerCase() === clean) ||
    s.name.toLowerCase().includes(clean) ||
    (s.short && s.short.toLowerCase().includes(clean))
  );
}

// Detailed bridge curves
const BRIDGES = {
  DEUTZER: [
    [50.935712, 6.959269], // Heumarkt
    [50.935400, 6.963500],
    [50.935100, 6.968000], // Rhein Mitte
    [50.934800, 6.971500],
    [50.936050, 6.974050]  // Deutzer Freiheit
  ],
  SEVERINS: [
    [50.929180, 6.957260], // Severinstr.
    [50.930800, 6.963500],
    [50.931200, 6.969000], // Rhein Mitte
    [50.931800, 6.973500],
    [50.932820, 6.978250]  // Suevenstr.
  ],
  MUELHEIMER: [
    [50.970200, 6.980500], // Slabystr.
    [50.970500, 6.988000], // Rhein Mitte
    [50.966000, 7.001000]  // Wiener Platz
  ]
};

const results = [];

// 1. Generate Stadtbahn Tracks
for (const [lineId, stopNames] of Object.entries(LINE_ROUTES)) {
  const segments = [];
  const validStops = [];
  const allCoords = [];

  for (const name of stopNames) {
    const st = findStationByNameOrId(name);
    if (st && st.lat && st.lng) {
      validStops.push({
        id: st.id,
        name: st.name,
        short: st.short || name,
        lat: st.lat,
        lng: st.lng,
        isUnderground: TUNNEL_STOP_NAMES.has(st.short) || TUNNEL_STOP_NAMES.has(name) || st.isUnderground
      });
    }
  }

  for (let i = 0; i < validStops.length - 1; i++) {
    const s1 = validStops[i];
    const s2 = validStops[i + 1];
    const isTunnel = s1.isUnderground && s2.isUnderground;
    let segCoords = [[s1.lat, s1.lng]];

    // Check bridge intersections
    const crossRhine = (s1.lng < 6.965 && s2.lng > 6.965) || (s1.lng > 6.965 && s2.lng < 6.965);
    if (crossRhine) {
      let bridgePts = null;
      if (['1', '7', '9'].includes(lineId)) {
        bridgePts = BRIDGES.DEUTZER;
      } else if (['3', '4'].includes(lineId)) {
        bridgePts = BRIDGES.SEVERINS;
      } else if (['13', '18'].includes(lineId)) {
        bridgePts = BRIDGES.MUELHEIMER;
      }

      if (bridgePts) {
        segCoords = s1.lng < s2.lng ? bridgePts : [...bridgePts].reverse();
        segments.push({
          coords: segCoords,
          isTunnel: false,
          isBridge: true,
          railway: 'tram'
        });
        segCoords.forEach(c => allCoords.push(c));
        continue;
      }
    }

    segCoords.push([s2.lat, s2.lng]);
    segments.push({
      coords: segCoords,
      isTunnel,
      isBridge: false,
      railway: isTunnel ? 'subway' : 'tram'
    });

    if (allCoords.length === 0) allCoords.push(segCoords[0]);
    allCoords.push(segCoords[1]);
  }

  const col = LINE_COLORS[lineId] || { bg: '#E3000F', text: '#FFFFFF' };
  results.push({
    line: lineId,
    name: `Linie ${lineId}`,
    color: col.bg,
    textColor: col.text,
    routeType: 'stadtbahn',
    mode: 'stadtbahn',
    segments,
    coordinates: allCoords,
    stops: validStops
  });
}

// 2. Generate Bus Routes
for (const [busId, stopNames] of Object.entries(BUS_ROUTES)) {
  const validStops = [];
  const allCoords = [];
  const segments = [];

  for (const name of stopNames) {
    const st = findStationByNameOrId(name);
    if (st && st.lat && st.lng) {
      validStops.push({
        id: st.id,
        name: st.name,
        short: st.short || name,
        lat: st.lat,
        lng: st.lng,
        isUnderground: false
      });
      allCoords.push([st.lat, st.lng]);
    }
  }

  for (let i = 0; i < validStops.length - 1; i++) {
    const s1 = validStops[i];
    const s2 = validStops[i + 1];
    segments.push({
      coords: [[s1.lat, s1.lng], [s2.lat, s2.lng]],
      isTunnel: false,
      isBridge: false,
      railway: 'bus'
    });
  }

  const col = LINE_COLORS[busId] || LINE_COLORS['default-bus'];
  results.push({
    line: busId,
    name: `Bus ${busId}`,
    color: col.bg,
    textColor: col.text,
    routeType: 'bus',
    mode: 'bus',
    segments,
    coordinates: allCoords,
    stops: validStops
  });
}

writeFileSync(OUT_FILE, JSON.stringify(results, null, 2), 'utf8');
console.log(`🎉 Generated ${results.length} KVB routes (Stadtbahn & Bus) in ${OUT_FILE}!`);

// Sync to SQLite
saveTransitTracks(results);
console.log(`💾 Synchronized ${results.length} lines into SQLite 'transit_tracks'!`);
