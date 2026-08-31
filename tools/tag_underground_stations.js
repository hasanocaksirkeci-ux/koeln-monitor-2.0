/**
 * Tag all verified Cologne KVB stations with isUnderground status and clean Stadtbahn lines
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { saveTransitStations } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STATIONS_FILE = join(__dirname, 'verified_stations.json');
const stations = JSON.parse(readFileSync(STATIONS_FILE, 'utf8'));

// Verified list of subterranean (U-Bahn) stations in Cologne
const UNDERGROUND_STATION_NAMES = [
  'dom/hbf',
  'appellhofplatz',
  'neumarkt',
  'poststraße',
  'poststr',
  'severinstraße',
  'severinstr',
  'heumarkt',
  'rathaus',
  'breslauer platz',
  'ebertplatz',
  'hansaring',
  'christophstr',
  'friesenplatz',
  'rudolfplatz',
  'kartäuserhof',
  'chlodwigplatz',
  'bonner wall',
  'hans-böckler-platz',
  'piusstraße',
  'piusstr',
  'körnerstraße',
  'körnerstr',
  'venloer str./gürtel',
  'leyendeckerstraße',
  'leyendeckerstr',
  'rochusplatz',
  'akazienweg',
  'äußere kanalstr',
  'kalk post',
  'kalk kapelle',
  'fuldaer straße',
  'fuldaer str',
  'vingst',
  'wiener platz',
  'bf mülheim',
  'heimersdorf',
  'chorweiler',
  'chorweiler nord',
  'geldernstr',
  'escher str',
  'amsterdamer str./gürtel',
  'margaretastr',
  'iltisstr',
  'lenauplatz'
];

const VALID_STADTBAHN_LINES = new Set(['1', '3', '4', '5', '7', '9', '12', '13', '15', '16', '17', '18']);

let undergroundCount = 0;

const enriched = stations.map(s => {
  const nameLower = (s.name || '').toLowerCase();
  const shortLower = (s.short || '').toLowerCase();

  const isUnderground = UNDERGROUND_STATION_NAMES.some(u => nameLower.includes(u) || shortLower.includes(u));
  if (isUnderground) undergroundCount++;

  // Keep only KVB Stadtbahn lines (1-18)
  const stadtbahnLines = (s.lines || []).filter(l => VALID_STADTBAHN_LINES.has(String(l).trim()));

  return {
    ...s,
    isUnderground,
    lines: stadtbahnLines.length > 0 ? stadtbahnLines : s.lines
  };
});

writeFileSync(STATIONS_FILE, JSON.stringify(enriched, null, 2), 'utf8');
console.log(`✅ Enriched ${enriched.length} stations: ${undergroundCount} tagged as U-Bahn (Unterirdisch).`);

// Save to SQLite
try {
  saveTransitStations(enriched);
  console.log(`💾 Successfully synchronized ${enriched.length} stations into SQLite 'transit_stations'!`);
} catch (e) {
  console.error('Error saving to SQLite:', e.message);
}
