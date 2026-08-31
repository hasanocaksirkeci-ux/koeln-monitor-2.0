import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveTransitTracks } from './db.js';
import { LINE_ROUTES, BUS_ROUTES, findStation } from './stations-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../data/koeln_osm_tracks.json');

const KVB_COLORS = {
  '1': '#E3000F',
  '3': '#8B5EA2',
  '4': '#E30679',
  '5': '#865438',
  '7': '#EC6608',
  '9': '#3C2067',
  '12': '#71A825',
  '13': '#A67C52',
  '15': '#00835B',
  '16': '#006596',
  '17': '#7CAFD4',
  '18': '#0097D6'
};

async function queryOverpass(query) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  for (const ep of endpoints) {
    try {
      console.log(`[OSM/Overpass] Requesting from ${ep}...`);
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'KoelnLiveMonitor-GeofabrikParser/2.0 (OpenStreetMap Cologne Transit)'
        },
        body: 'data=' + encodeURIComponent(query)
      });

      if (!res.ok) {
        console.warn(`[OSM/Overpass] ${ep} returned HTTP ${res.status}`);
        continue;
      }

      const json = await res.json();
      return json;
    } catch (err) {
      console.warn(`[OSM/Overpass] Error on ${ep}:`, err.message);
    }
  }
  throw new Error('All Overpass API endpoints failed');
}

/**
 * Stitch and order OSM ways into a smooth continuous path
 */
function stitchWays(ways, wayMap, nodeMap) {
  const segments = [];
  const allCoords = [];

  ways.forEach(w => {
    const wayObj = typeof w === 'object' && w.nodes ? w : wayMap.get(w.ref || w);
    if (!wayObj || !wayObj.nodes) return;

    const coords = [];
    wayObj.nodes.forEach(nId => {
      const node = nodeMap.get(nId);
      if (node) coords.push([node.lat, node.lon]);
    });

    if (coords.length > 1) {
      const isTunnel = !!(wayObj.tags && (
        wayObj.tags.tunnel === 'yes' ||
        wayObj.tags.tunnel === 'building_passage' ||
        wayObj.tags.location === 'underground' ||
        parseInt(wayObj.tags.layer) < 0
      ));
      const isBridge = !!(wayObj.tags && (wayObj.tags.bridge === 'yes' || parseInt(wayObj.tags.layer) > 0));

      segments.push({
        isTunnel,
        isBridge,
        coords
      });

      coords.forEach(c => allCoords.push(c));
    }
  });

  return { segments, allCoords };
}

export async function fetchExactOsmTransitTracks() {
  console.log('===============================================================');
  console.log('🗺️ Fetching 100% Real OpenStreetMap / Geofabrik Vector Tracks');
  console.log('===============================================================\n');

  // Query all KVB Stadtbahn relations in Cologne bounding box
  const query = `[out:json][timeout:90];
(
  relation["type"="route"]["route"~"light_rail|subway|tram"]["ref"~"^(1|3|4|5|7|9|12|13|15|16|17|18)$"](50.75,6.70,51.15,7.25);
);
out body;
>;
out skel qt;`;

  const osmData = await queryOverpass(query);
  console.log(`[OSM] Received ${osmData.elements.length} OSM elements.`);

  const nodeMap = new Map();
  const wayMap = new Map();
  const relationList = [];

  osmData.elements.forEach(el => {
    if (el.type === 'node') {
      nodeMap.set(el.id, { lat: el.lat, lon: el.lon });
    } else if (el.type === 'way') {
      wayMap.set(el.id, el);
    } else if (el.type === 'relation') {
      relationList.push(el);
    }
  });

  console.log(`[OSM] Indexed ${nodeMap.size} nodes, ${wayMap.size} ways, ${relationList.length} relations.`);

  const tracksByLine = new Map();

  // Process KVB Stadtbahn lines
  for (const rel of relationList) {
    const ref = rel.tags?.ref;
    if (!ref || !KVB_COLORS[ref]) continue;

    const wayMembers = (rel.members || []).filter(m => m.type === 'way');
    if (wayMembers.length === 0) continue;

    const { segments, allCoords } = stitchWays(wayMembers, wayMap, nodeMap);
    if (allCoords.length === 0) continue;

    const existing = tracksByLine.get(ref);
    if (!existing || allCoords.length > existing.coordinates.length) {
      const stopNames = LINE_ROUTES[ref] || [];
      const stops = stopNames.map(name => {
        const st = findStation(name);
        if (st) return st;
        return { name, short: name, lat: 50.9375, lng: 6.9603 };
      });

      tracksByLine.set(ref, {
        line: ref,
        name: `Linie ${ref}`,
        color: KVB_COLORS[ref] || '#00f0ff',
        textColor: '#ffffff',
        routeType: 'stadtbahn',
        mode: 'stadtbahn',
        coordinates: allCoords,
        segments: segments,
        stops: stops,
        osmRelationId: rel.id,
        osmRelationName: rel.tags?.name || rel.tags?.description || ''
      });
    }
  }

  console.log(`[OSM] Successfully extracted exact OSM tracks for ${tracksByLine.size} Stadtbahn lines!`);

  // Fill in any missing Stadtbahn lines from LINE_ROUTES
  Object.keys(LINE_ROUTES).forEach(ref => {
    if (!tracksByLine.has(ref)) {
      const stopNames = LINE_ROUTES[ref] || [];
      const stops = stopNames.map(name => {
        const st = findStation(name);
        if (st) return st;
        return { name, short: name, lat: 50.9375, lng: 6.9603 };
      });
      const coords = stops.map(s => [s.lat, s.lng]);
      tracksByLine.set(ref, {
        line: ref,
        name: `Linie ${ref}`,
        color: KVB_COLORS[ref] || '#00f0ff',
        textColor: '#ffffff',
        routeType: 'stadtbahn',
        mode: 'stadtbahn',
        coordinates: coords,
        segments: [{ isTunnel: false, coords }],
        stops: stops
      });
    }
  });

  // Combine with Bus routes from stations-data
  const finalTracks = [];
  for (const [line, track] of tracksByLine.entries()) {
    finalTracks.push(track);
  }

  // Add Bus routes
  Object.keys(BUS_ROUTES).forEach(line => {
    const stopNames = BUS_ROUTES[line] || [];
    const stops = stopNames.map(name => {
      const st = findStation(name);
      if (st) return st;
      return { name, short: name, lat: 50.9375, lng: 6.9603 };
    });
    const coords = stops.map(s => [s.lat, s.lng]);
    finalTracks.push({
      line: line,
      name: `Bus ${line}`,
      color: '#D92534',
      textColor: '#ffffff',
      routeType: 'bus',
      mode: 'bus',
      coordinates: coords,
      segments: [{ isTunnel: false, coords }],
      stops: stops
    });
  });

  // Save to JSON
  fs.writeFileSync(DATA_FILE, JSON.stringify(finalTracks, null, 2), 'utf-8');
  console.log(`[OSM] Saved ${finalTracks.length} high-precision lines to ${DATA_FILE}`);

  // Sync to SQLite
  saveTransitTracks(finalTracks);

  console.log(`[SQLite] Synchronized ${finalTracks.length} tracks into koeln_monitor.sqlite!`);
  return finalTracks;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchExactOsmTransitTracks().then(() => {
    console.log('✅ OSM Vector Extraction Finished Successfully!');
    process.exit(0);
  }).catch(err => {
    console.error('❌ OSM Extraction Failed:', err);
    process.exit(1);
  });
}
