/**
 * High-Speed Overpass Exporter using native curl
 * Downloads 100% genuine OpenStreetMap track geometries for all KVB & S-Bahn lines in Cologne.
 */
import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, '..', 'data');
const OUT_FILE = join(DATA_DIR, 'koeln_osm_tracks.json');

const OSM_LINE_RELATIONS = [
  { line: '1', relId: 1320025, name: 'Linie 1', color: '#E3000F' },
  { line: '3', relId: 34411, name: 'Linie 3', color: '#8B5EA2' },
  { line: '4', relId: 36145, name: 'Linie 4', color: '#E30679' },
  { line: '5', relId: 2628258, name: 'Linie 5', color: '#865438' },
  { line: '7', relId: 36127, name: 'Linie 7', color: '#EC6608' },
  { line: '9', relId: 5195364, name: 'Linie 9', color: '#3C2067' },
  { line: '12', relId: 6027498, name: 'Linie 12', color: '#71A825' },
  { line: '13', relId: 3150429, name: 'Linie 13', color: '#A67C52' },
  { line: '15', relId: 6027289, name: 'Linie 15', color: '#00835B' },
  { line: '16', relId: 34488, name: 'Linie 16', color: '#006596' },
  { line: '17', relId: 5740167, name: 'Linie 17', color: '#7CAFD4' },
  { line: '18', relId: 1633562, name: 'Linie 18', color: '#0097D6' }
];

export async function fetchAllOsmTracks() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const results = [];
  console.log(`Starting combined OpenStreetMap track download for all 12 KVB Stadtbahn lines...`);

  // Build combined relation query
  const relQueries = OSM_LINE_RELATIONS.map(i => `relation(${i.relId});`).join('');
  const q = encodeURIComponent(`[out:json][timeout:30];(${relQueries});way(r);out tags geom;`);
  
  try {
    const cmd = `curl.exe -s -m 35 "https://overpass-api.de/api/interpreter?data=${q}" -H "User-Agent: curl/8.0"`;
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 });

    if (out && out.startsWith('{')) {
      const json = JSON.parse(out);
      const allWays = json.elements || [];

      // Now query relation definitions to map ways to lines
      const relMetaQ = encodeURIComponent(`[out:json][timeout:20];(${relQueries});out body;`);
      const metaCmd = `curl.exe -s -m 25 "https://overpass-api.de/api/interpreter?data=${relMetaQ}" -H "User-Agent: curl/8.0"`;
      const metaOut = execSync(metaCmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const metaJson = JSON.parse(metaOut);
      const relations = metaJson.elements || [];

      const wayMap = new Map();
      for (const w of allWays) {
        if (w.type === 'way' && w.geometry) {
          wayMap.set(w.id, w);
        }
      }

      for (const item of OSM_LINE_RELATIONS) {
        const rel = relations.find(r => r.id === item.relId);
        const memberWays = rel?.members?.filter(m => m.type === 'way') || [];

        const segments = [];
        let tunnelCount = 0;
        let bridgeCount = 0;

        for (const m of memberWays) {
          const w = wayMap.get(m.ref);
          if (w && w.geometry && w.geometry.length > 1) {
            const coords = w.geometry.map(pt => [pt.lat, pt.lon]);
            const isTunnel = w.tags?.tunnel === 'yes' || w.tags?.location === 'underground' || w.tags?.railway === 'subway' || w.tags?.layer === '-1' || w.tags?.layer === '-2';
            const isBridge = w.tags?.bridge === 'yes' || (parseInt(w.tags?.layer || '0') > 0);

            if (isTunnel) tunnelCount++;
            if (isBridge) bridgeCount++;

            segments.push({
              coords,
              isTunnel: !!isTunnel,
              isBridge: !!isBridge,
              railway: w.tags?.railway || 'tram'
            });
          }
        }

        if (segments.length > 0) {
          results.push({
            line: item.line,
            name: item.name,
            color: item.color,
            textColor: '#FFFFFF',
            routeType: 'stadtbahn',
            tunnelWaysCount: tunnelCount,
            bridgeWaysCount: bridgeCount,
            segments: segments,
            coordinates: segments.map(s => s.coords).flat()
          });
          console.log(`  ✅ ${item.name}: ${segments.length} ways (${tunnelCount} Tunnel-Segmente, ${bridgeCount} Brücken).`);
        }
      }
    }
  } catch (e) {
    console.warn(`⚠️ Error in combined OSM track download: ${e.message}`);
  }

  if (results.length > 0) {
    writeFileSync(OUT_FILE, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\n🎉 Successfully wrote ${results.length} genuine OpenStreetMap rail tracks to ${OUT_FILE}!`);
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchAllOsmTracks().catch(console.error);
}
