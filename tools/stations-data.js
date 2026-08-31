/**
 * Köln Live-Monitor: Verifizierte Haltestellendaten & Liniennetz
 * 100% verifiziert über KVB HAFAS & OSM (Stadtbahn & Bus getrennt, ohne S-Bahn/DB)
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { saveTransitTracks } from './db.js';
import { calculateDrivingRoute } from './tomtom-routing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let VERIFIED_STATIONS = [];
try {
  const data = readFileSync(join(__dirname, 'verified_stations.json'), 'utf8');
  VERIFIED_STATIONS = JSON.parse(data);
} catch (e) {
  console.error('Error loading verified_stations.json:', e.message);
}

// Key hub stations in Cologne (Stadtbahn & Bus Knotenpunkte)
export const MAJOR_HUBS = [
  '900000002', // Neumarkt
  '900000752', // Dom/Hbf
  '900000035', // Ebertplatz
  '900000001', // Heumarkt
  '900000030', // Friesenplatz
  '900000027', // Rudolfplatz
  '900000018', // Chlodwigplatz
  '900000023', // Barbarossaplatz
  '900000036', // Hansaring
  '900000304', // Florastr.
  '900000251', // Venloer Str./Gürtel
  '900000570', // Wiener Platz
  '900000802', // Bf Deutz/Messe
  '900000702', // Weiden West
  '900000385', // Chorweiler
  '900000486'  // Zündorf
];

// Official KVB Line Colors
export const LINE_COLORS = {
  '1': { bg: '#E3000F', text: '#FFFFFF', name: 'Linie 1', mode: 'stadtbahn' },
  '3': { bg: '#8B5EA2', text: '#FFFFFF', name: 'Linie 3', mode: 'stadtbahn' },
  '4': { bg: '#E30679', text: '#FFFFFF', name: 'Linie 4', mode: 'stadtbahn' },
  '5': { bg: '#865438', text: '#FFFFFF', name: 'Linie 5', mode: 'stadtbahn' },
  '7': { bg: '#EC6608', text: '#FFFFFF', name: 'Linie 7', mode: 'stadtbahn' },
  '9': { bg: '#3C2067', text: '#FFFFFF', name: 'Linie 9', mode: 'stadtbahn' },
  '12': { bg: '#71A825', text: '#FFFFFF', name: 'Linie 12', mode: 'stadtbahn' },
  '13': { bg: '#A67C52', text: '#FFFFFF', name: 'Linie 13', mode: 'stadtbahn' },
  '15': { bg: '#00835B', text: '#FFFFFF', name: 'Linie 15', mode: 'stadtbahn' },
  '16': { bg: '#006596', text: '#FFFFFF', name: 'Linie 16', mode: 'stadtbahn' },
  '17': { bg: '#7CAFD4', text: '#000000', name: 'Linie 17', mode: 'stadtbahn' },
  '18': { bg: '#0097D6', text: '#FFFFFF', name: 'Linie 18', mode: 'stadtbahn' },
  // Bus Line Colors
  '106': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 106', mode: 'bus' },
  '121': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 121', mode: 'bus' },
  '127': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 127', mode: 'bus' },
  '130': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 130', mode: 'bus' },
  '132': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 132', mode: 'bus' },
  '133': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 133', mode: 'bus' },
  '136': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 136', mode: 'bus' },
  '140': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 140', mode: 'bus' },
  '141': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 141', mode: 'bus' },
  '142': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 142', mode: 'bus' },
  '143': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 143', mode: 'bus' },
  '146': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 146', mode: 'bus' },
  '150': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 150', mode: 'bus' },
  '151': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 151', mode: 'bus' },
  '152': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 152', mode: 'bus' },
  '153': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 153', mode: 'bus' },
  '159': { bg: '#D92534', text: '#FFFFFF', name: 'Bus 159', mode: 'bus' },
  'SB40': { bg: '#E65100', text: '#FFFFFF', name: 'Schnellbus SB40', mode: 'bus' },
  'default-bus': { bg: '#D92534', text: '#FFFFFF', name: 'KVB Bus', mode: 'bus' },
  'default-train': { bg: '#006596', text: '#FFFFFF', name: 'KVB Stadtbahn', mode: 'stadtbahn' }
};

export function getLineColor(lineName) {
  if (!lineName) return LINE_COLORS['default-train'];
  const clean = String(lineName).trim().toUpperCase();
  if (LINE_COLORS[clean]) return LINE_COLORS[clean];
  const numOnly = clean.replace(/^(LINIE|STRASSENBAHN|STADTBAHN|BUS|SB)\s*/i, '');
  if (LINE_COLORS[numOnly]) return LINE_COLORS[numOnly];
  if (/^\d{3}$/.test(clean) || clean.startsWith('SB') || clean.startsWith('BUS')) {
    return { bg: '#D92534', text: '#FFFFFF', name: clean, mode: 'bus' };
  }
  return LINE_COLORS['default-train'];
}

export const getLineStyle = getLineColor;

// Station identifier helper
export function findStation(query) {
  if (!query) return null;
  let q = String(query).toLowerCase().trim();
  // Strip common fillers
  q = q.replace(/^(die|der|das|dem|den|köln|station|haltestelle)\s+/i, '')
       .replace(/\s+(auf der karte|auf der map|auf karte|bitte|jetzt|zeigen|einzeichnen|köln)$/i, '')
       .replace(/[\?\!\.,]*$/, '')
       .trim();
  if (!q) return null;

  // Exact matches first
  const exact = VERIFIED_STATIONS.find(s => 
    s.id === q || 
    s.name.toLowerCase() === q || 
    s.short.toLowerCase() === q
  );
  if (exact) return exact;

  // Substring matches
  return VERIFIED_STATIONS.find(s => 
    s.name.toLowerCase().includes(q) || 
    s.short.toLowerCase().includes(q) ||
    q.includes(s.short.toLowerCase())
  );
}

// Rhine Bridges (Brückenquerungen)
const BRIDGE_WAYPOINTS = {
  // Deutzer Brücke: Stadtbahn Linien 1, 7, 9 (Heumarkt <-> Deutzer Freiheit)
  DEUTZER_BRUECKE: [
    [50.93571, 6.95927], // Heumarkt
    [50.93540, 6.96350], // Deutzer Brücke West
    [50.93510, 6.96800], // Deutzer Brücke Mitte
    [50.93480, 6.97150], // Deutzer Brücke Ost
    [50.93605, 6.97405]  // Deutzer Freiheit
  ],
  // Severinsbrücke: Stadtbahn Linien 3, 4 (Severinstr. <-> Suevenstr.)
  SEVERINSBRUECKE: [
    [50.92918, 6.95726], // Severinstr.
    [50.93080, 6.96350], // Severinsbrücke West
    [50.93120, 6.96900], // Severinsbrücke Mitte
    [50.93180, 6.97350], // Severinsbrücke Ost
    [50.93282, 6.97825]  // Suevenstr.
  ],
  // Mülheimer Brücke: Stadtbahn Linien 13, 18 (Slabystr. <-> Wiener Platz)
  MUELHEIMER_BRUECKE: [
    [50.97020, 6.98050], // Slabystr.
    [50.97050, 6.98800], // Mülheimer Brücke Mitte
    [50.96600, 7.00100]  // Wiener Platz
  ]
};

// 100% KVB Stadtbahn Line Routes (1, 3, 4, 5, 7, 9, 12, 13, 15, 16, 17, 18)
export const LINE_ROUTES = {
  '1': [
    'Weiden West', 'Junkersdorf', 'RheinEnergieSTADION', 'Aachener Str./Gürtel',
    'Universitätsstr.', 'Moltkestr.', 'Rudolfplatz', 'Neumarkt', 'Heumarkt',
    'Deutzer Freiheit', 'Bf Deutz/Messe', 'Deutz Technische Hochschule', 'Kalk Post', 'Kalk Kapelle',
    'Fuldaer Str.', 'Höhenberg Frankfurter Str.', 'Merheim', 'Brück Mauspfad', 'Lustheide', 'Refrath', 'Bensberg'
  ],
  '3': [
    'Görlinger-Zentrum', 'Bocklemünd', 'Akazienweg', 'Rochusplatz', 'Leyendeckerstr.',
    'Venloer Str./Gürtel', 'Körnerstr.', 'Piusstr.', 'Hans-Böckler-Platz/Bf West', 'Friesenplatz', 'Appellhofplatz',
    'Neumarkt', 'Poststr.', 'Severinstr.', 'Suevenstr.', 'Bf Deutz/Messe', 'Koelnmesse', 'Stegerwaldsiedlung',
    'Buchforst Waldecker Str.', 'Buchheim Herler Str.', 'Holweide Vischeringstr.', 'Dellbrück Hauptstr.', 'Thielenbruch'
  ],
  '4': [
    'Bocklemünd', 'Akazienweg', 'Rochusplatz', 'Leyendeckerstr.', 'Venloer Str./Gürtel',
    'Körnerstr.', 'Piusstr.', 'Hans-Böckler-Platz/Bf West', 'Friesenplatz', 'Appellhofplatz', 'Neumarkt',
    'Poststr.', 'Severinstr.', 'Suevenstr.', 'Bf Deutz/Messe', 'Koelnmesse', 'Stegerwaldsiedlung', 'Grünstr.',
    'Von-Sparr-Str.', 'Keupstr.', 'Wiener Platz', 'Schlebusch'
  ],
  '5': [
    'Sparkasse Am Butzweilerhof', 'Rektor-Klein-Str.', 'Alter Flughafen Butzweilerhof',
    'Iltisstr.', 'Lenauplatz', 'Nußbaumerstr.', 'Subbelrather Str./Gürtel', 'Liebigstr.',
    'Friesenplatz', 'Appellhofplatz', 'Dom/Hbf', 'Rathaus', 'Heumarkt'
  ],
  '7': [
    'Frechen Benzelrath', 'Frechen Rathaus', 'Marsdorf', 'Haus Vorst', 'Stüttgenhof',
    'Brahmsstr.', 'Aachener Str./Gürtel', 'Universitätsstr.', 'Moltkestr.', 'Rudolfplatz',
    'Neumarkt', 'Heumarkt', 'Deutzer Freiheit', 'Poll Salmstr.', 'Westhoven Berliner Str.',
    'Ensen Gilgaustr.', 'Porz Steinstr.', 'Porz Markt', 'Zündorf'
  ],
  '9': [
    'Hermeskeiler Platz', 'Uniklinik Köln', 'Dasselstr./ Süd Bf', 'Zülpicher Platz', 'Mauritiuskirche',
    'Neumarkt', 'Heumarkt', 'Deutzer Freiheit', 'Deutz Technische Hochschule',
    'Kalk Post', 'Kalk Kapelle', 'Vingst', 'Ostheim', 'Neubrück', 'Königsforst'
  ],
  '12': [
    'Merkenich', 'Fordwerke Nord', 'Scheibenstr.', 'Wilhelm-Sollmann-Str.', 'Florastr.',
    'Lohsestr.', 'Ebertplatz', 'Hansaring', 'Christophstr./Mediapark', 'Friesenplatz',
    'Rudolfplatz', 'Zülpicher Platz', 'Barbarossaplatz', 'Eifelplatz', 'Pohligstr.',
    'Herthastr.', 'Gottesweg', 'Südfriedhof', 'Zollstock'
  ],
  '13': [
    'Sülzgürtel', 'Zülpicher Str./Gürtel', 'Aachener Str./Gürtel', 'Venloer Str./Gürtel',
    'Subbelrather Str./Gürtel', 'Nußbaumerstr.', 'Neusser Str./Gürtel',
    'Amsterdamer Str./Gürtel', 'Slabystr.', 'Wiener Platz', 'Bf Mülheim',
    'Buchheim Herler Str.', 'Holweide Vischeringstr.'
  ],
  '15': [
    'Chorweiler', 'Heimersdorf', 'Longerich', 'Scheibenstr.', 'Wilhelm-Sollmann-Str.',
    'Florastr.', 'Lohsestr.', 'Ebertplatz', 'Hansaring', 'Christophstr./Mediapark',
    'Friesenplatz', 'Rudolfplatz', 'Zülpicher Platz', 'Barbarossaplatz', 'Eifelstr.',
    'Ulrepforte', 'Chlodwigplatz', 'Ubierring'
  ],
  '16': [
    'Sebastianstr.', 'Amsterdamer Str./Gürtel', 'Reichenspergerplatz', 'Ebertplatz',
    'Breslauer Platz/Hbf', 'Dom/Hbf', 'Appellhofplatz', 'Neumarkt', 'Poststr.', 'Barbarossaplatz',
    'Eifelstr.', 'Ulrepforte', 'Chlodwigplatz', 'Ubierring', 'Bayenthalgürtel',
    'Heinrich-Lübke-Ufer', 'Rodenkirchen Bf', 'Sürth Bf', 'Godorf Bf', 'Wesseling Nord',
    'Wesseling', 'Bonn Hbf'
  ],
  '17': [
    'Severinstr.', 'Kartäuserhof', 'Chlodwigplatz', 'Bonner Wall', 'Rodenkirchen Bf', 'Sürth Bf'
  ],
  '18': [
    'Thielenbruch', 'Dellbrück Hauptstr.', 'Holweide Vischeringstr.', 'Buchheim Herler Str.',
    'Wiener Platz', 'Slabystr.', 'Boltensternstr.', 'Zoo/Flora', 'Reichenspergerplatz',
    'Ebertplatz', 'Breslauer Platz/Hbf', 'Dom/Hbf', 'Appellhofplatz', 'Neumarkt',
    'Poststr.', 'Barbarossaplatz', 'Eifelwall', 'Klettenbergpark', 'Efferen', 'Hürth-Hermülheim',
    'Kiebitzweg', 'Fischenich', 'Brühl Nord', 'Brühl Mitte', 'Badorf', 'Bornheim', 'Bonn Hbf'
  ]
};

// 100% KVB Major Bus Routes (Busnetz Köln)
export const BUS_ROUTES = {
  '106': [
    'Breslauer Platz/Hbf', 'Heumarkt', 'Severinstr.', 'Chlodwigplatz', 'Bonner Wall', 'Marienburg'
  ],
  '121': [
    'Neusser Str./Gürtel', 'Bilderstöckchen', 'Longerich', 'Chorweiler'
  ],
  '127': [
    'Ebertplatz', 'Hansaring', 'Merheimer Platz', 'Bilderstöckchen', 'Bickendorf', 'Longerich'
  ],
  '130': [
    'Sülzgürtel', 'Universität', 'Barbarossaplatz', 'Bayenthal', 'Rodenkirchen Bf'
  ],
  '132': [
    'Breslauer Platz/Hbf', 'Heumarkt', 'Severinstr.', 'Chlodwigplatz', 'Bonner Wall', 'Rondorf', 'Meschenich'
  ],
  '133': [
    'Breslauer Platz/Hbf', 'Heumarkt', 'Severinstr.', 'Chlodwigplatz', 'Südfriedhof'
  ],
  '136': [
    'Neumarkt', 'Rudolfplatz', 'Moltkestr.', 'Universitätsstr.', 'Hohenlind'
  ],
  '140': [
    'Ebertplatz', 'Zoo/Flora', 'Wiener Platz', 'Buchheim Herler Str.', 'Holweide Vischeringstr.'
  ],
  '141': [
    'Weiden West', 'Junkersdorf', 'RheinEnergieSTADION', 'Bf Ehrenfeld', 'Bocklemünd'
  ],
  '142': [
    'Ubierring', 'Chlodwigplatz', 'Eifelstr.', 'Dasselstr./ Süd Bf', 'Universitätsstr.', 'Bf Ehrenfeld', 'Merheimer Platz'
  ],
  '143': [
    'Bocklemünd', 'Lövenich', 'Junkersdorf', 'Marsdorf', 'Weiden West'
  ],
  '146': [
    'Neumarkt', 'Rudolfplatz', 'Moltkestr.', 'Universitätsstr.', 'Aachener Str./Gürtel'
  ],
  '150': [
    'Bf Deutz/Messe', 'Deutzer Freiheit', 'Stegerwaldsiedlung', 'Wiener Platz', 'Bf Mülheim'
  ],
  '151': [
    'Wiener Platz', 'Bf Mülheim', 'Buchheim Herler Str.', 'Fuldaer Str.', 'Ostheim', 'Porz Markt'
  ],
  '152': [
    'Wiener Platz', 'Bf Mülheim', 'Kalk Post', 'Vingst', 'Ostheim', 'Porz Markt'
  ],
  '153': [
    'Deutz Technische Hochschule', 'Bf Deutz/Messe', 'Wiener Platz', 'Dünnwald'
  ],
  '159': [
    'Buchheim Herler Str.', 'Kalk Post', 'Kalk Kapelle', 'Poll Salmstr.'
  ]
};

// Tunnel stops configuration for high-end glowing underground tube rendering
export const TUNNEL_STOP_NAMES = new Set([
  // Nord-Süd-Stadtbahn
  'Severinstr.', 'Kartäuserhof', 'Chlodwigplatz', 'Bonner Wall', 'Rathaus', 'Heumarkt',
  // Ringe-Tunnel
  'Florastr.', 'Lohsestr.', 'Ebertplatz', 'Hansaring', 'Christophstr./Mediapark', 'Friesenplatz', 'Rudolfplatz',
  // City-Tunnel
  'Reichenspergerplatz', 'Breslauer Platz/Hbf', 'Dom/Hbf', 'Appellhofplatz', 'Neumarkt', 'Poststr.',
  // Ehrenfeld-Tunnel
  'Venloer Str./Gürtel', 'Körnerstr.', 'Piusstr.', 'Hans-Böckler-Platz/Bf West',
  // Kalk- & Mülheim-Tunnel
  'Kalk Post', 'Kalk Kapelle', 'Vingst', 'Wiener Platz', 'Bf Mülheim', 'Buchforst Waldecker Str.',
  // Subbelrather / Chorweiler
  'Liebigstr.', 'Chorweiler'
]);

/**
 * Build line track coordinates GeoJSON for the Leaflet map
 * Returns both Stadtbahn and Bus network cleanly separated
 */
export function getLineTracks(mode = 'all') {
  const tracks = [];

  // 1. Process KVB Stadtbahn Lines
  if (mode === 'all' || mode === 'stadtbahn') {
    for (const [lineId, stopList] of Object.entries(LINE_ROUTES)) {
      const coords = [];
      const stopDetails = [];
      const segments = [];
      
      for (let i = 0; i < stopList.length; i++) {
        const nameQuery = stopList[i];
        const found = VERIFIED_STATIONS.find(s => 
          s.name.toLowerCase().includes(nameQuery.toLowerCase()) ||
          (s.short && s.short.toLowerCase().includes(nameQuery.toLowerCase()))
        );
        if (found && found.lat && found.lng) {
          const prevStation = stopDetails[stopDetails.length - 1];
          
          // Deutzer Brücke connection (Heumarkt <-> Deutzer Freiheit)
          if (prevStation && 
              ((prevStation.name.includes('Heumarkt') && found.name.includes('Deutzer Freiheit')) ||
               (prevStation.name.includes('Deutzer Freiheit') && found.name.includes('Heumarkt')))) {
            coords.push([50.93540, 6.96350]);
            coords.push([50.93510, 6.96800]);
            coords.push([50.93480, 6.97150]);
          }
          
          // Severinsbrücke connection (Severinstr. <-> Suevenstr.)
          if (prevStation && 
              ((prevStation.name.includes('Severinstr') && found.name.includes('Suevenstr')) ||
               (prevStation.name.includes('Suevenstr') && found.name.includes('Severinstr')))) {
            coords.push([50.93080, 6.96350]);
            coords.push([50.93120, 6.96900]);
            coords.push([50.93180, 6.97350]);
          }

          // Mülheimer Brücke connection (Slabystr. <-> Wiener Platz)
          if (prevStation && 
              ((prevStation.name.includes('Slabystr') && found.name.includes('Wiener Platz')) ||
               (prevStation.name.includes('Wiener Platz') && found.name.includes('Slabystr')))) {
            coords.push([50.97050, 6.98800]);
          }

          coords.push([found.lat, found.lng]);
          const isTunnel = TUNNEL_STOP_NAMES.has(found.short) || TUNNEL_STOP_NAMES.has(nameQuery) || found.isUnderground;
          stopDetails.push({
            id: found.id,
            name: found.name,
            short: found.short || nameQuery,
            lat: found.lat,
            lng: found.lng,
            isUnderground: isTunnel
          });
        }
      }

      if (coords.length > 1) {
        const col = LINE_COLORS[lineId] || { bg: '#E3000F', text: '#FFFFFF' };
        
        // Build segments
        for (let i = 0; i < stopDetails.length - 1; i++) {
          const s1 = stopDetails[i];
          const s2 = stopDetails[i + 1];
          const isTunnel = s1.isUnderground && s2.isUnderground;
          segments.push({
            coords: [[s1.lat, s1.lng], [s2.lat, s2.lng]],
            isTunnel,
            isBridge: false,
            railway: isTunnel ? 'subway' : 'tram'
          });
        }

        tracks.push({
          line: lineId,
          name: `Linie ${lineId}`,
          color: col.bg,
          textColor: col.text,
          routeType: 'stadtbahn',
          mode: 'stadtbahn',
          coordinates: coords,
          segments: segments.length > 0 ? segments : [{ coords, isTunnel: false, isBridge: false }],
          stops: stopDetails
        });
      }
    }
  }

  // 2. Process KVB Bus Routes
  if (mode === 'all' || mode === 'bus') {
    for (const [busId, stopList] of Object.entries(BUS_ROUTES)) {
      const coords = [];
      const stopDetails = [];

      for (let i = 0; i < stopList.length; i++) {
        const nameQuery = stopList[i];
        const found = VERIFIED_STATIONS.find(s => 
          s.name.toLowerCase().includes(nameQuery.toLowerCase()) ||
          (s.short && s.short.toLowerCase().includes(nameQuery.toLowerCase()))
        );
        if (found && found.lat && found.lng) {
          coords.push([found.lat, found.lng]);
          stopDetails.push({
            id: found.id,
            name: found.name,
            short: found.short || nameQuery,
            lat: found.lat,
            lng: found.lng,
            isUnderground: false
          });
        }
      }

      if (coords.length > 1) {
        const col = LINE_COLORS[busId] || LINE_COLORS['default-bus'];
        tracks.push({
          line: busId,
          name: `Bus ${busId}`,
          color: col.bg,
          textColor: col.text,
          routeType: 'bus',
          mode: 'bus',
          coordinates: coords,
          segments: [{ coords, isTunnel: false, isBridge: false, railway: 'bus' }],
          stops: stopDetails
        });
      }
    }
  }

  // If pre-downloaded OSM high-precision vector tracks exist, merge them
  try {
    const osmFile = join(__dirname, '..', 'data', 'koeln_osm_tracks.json');
    if (existsSync(osmFile)) {
      const osmTracks = JSON.parse(readFileSync(osmFile, 'utf8'));
      for (const ot of osmTracks) {
        const existing = tracks.find(t => t.line === ot.line && t.mode === (ot.mode || 'stadtbahn'));
        if (existing) {
          existing.coordinates = ot.coordinates || existing.coordinates;
          existing.segments = ot.segments || existing.segments;
        } else if (ot.coordinates) {
          if (mode === 'all' || ot.mode === mode || (!ot.mode && mode === 'stadtbahn')) {
            tracks.push(ot);
          }
        }
      }
    }
    // Save to SQLite
    saveTransitTracks(tracks);
  } catch (e) {
    // Non-critical fallback
  }

  return tracks;
}

/**
 * Helper to slice track coordinates between two stations along a track line
 */
function sliceTrackBetween(track, stationA, stationB) {
  if (!track || !track.coordinates || track.coordinates.length < 2) return null;
  let startIdx = -1;
  let endIdx = -1;
  let minStartDist = Infinity;
  let minEndDist = Infinity;

  for (let i = 0; i < track.coordinates.length; i++) {
    const [cLat, cLng] = track.coordinates[i];
    const dStart = Math.hypot(cLat - stationA.lat, cLng - stationA.lng);
    const dEnd = Math.hypot(cLat - stationB.lat, cLng - stationB.lng);
    if (dStart < minStartDist) {
      minStartDist = dStart;
      startIdx = i;
    }
    if (dEnd < minEndDist) {
      minEndDist = dEnd;
      endIdx = i;
    }
  }

  if (minStartDist < 0.025 && minEndDist < 0.025 && startIdx !== -1 && endIdx !== -1) {
    if (startIdx === endIdx) return [track.coordinates[startIdx]];
    return startIdx < endIdx 
      ? track.coordinates.slice(startIdx, endIdx + 1)
      : track.coordinates.slice(endIdx, startIdx + 1).reverse();
  }
  return null;
}

/**
 * Builds real, transfer-aware track geometry for an ACTUAL selected HAFAS
 * journey (as returned by getRoutes() in kvb-client.js), instead of
 * independently guessing a route between the overall from/to pair.
 *
 * Each leg already carries the real line number and the real origin/
 * destination station names for that specific leg (including the real
 * transfer point) - this slices the matching line's track between those
 * exact stations per leg and concatenates them, so the drawn route matches
 * what the text itself describes (right start, right transfer, right line
 * per segment) instead of a from-scratch hub search that can pick a
 * different transfer point entirely.
 *
 * @param {Array} legs - route.legs from a getRoutes() journey option
 * @returns {{coordinates: number[][], segments: object[], geometrySource: string} | null}
 */
export function getJourneyTrackGeometry(legs) {
  if (!Array.isArray(legs) || legs.length === 0) return null;

  const allTracks = getLineTracks('all');
  const segments = [];

  for (const leg of legs) {
    const fromSt = findStation(leg.origin);
    const toSt = findStation(leg.destination);
    if (!fromSt || !toSt) continue;

    if (leg.walking || leg.type === 'walking') {
      // Honest straight connector between two real stations for a short
      // walking transfer - not a guess at a transit line's path.
      segments.push({
        coordinates: [[fromSt.lat, fromSt.lng], [toSt.lat, toSt.lng]],
        line: null,
        color: '#94a3b8',
        walking: true
      });
      continue;
    }

    const matchingTracks = allTracks.filter(t => String(t.line) === String(leg.line));
    let coords = null;
    let usedTrack = null;
    for (const track of matchingTracks) {
      const c = sliceTrackBetween(track, fromSt, toSt);
      if (c && c.length > 1) { coords = c; usedTrack = track; break; }
    }
    // Line-number match failed (naming mismatch between HAFAS and our
    // track data) - fall back to any track that actually connects these
    // two specific stations, still real geometry, not a guess.
    if (!coords) {
      for (const track of allTracks) {
        const c = sliceTrackBetween(track, fromSt, toSt);
        if (c && c.length > 1) { coords = c; usedTrack = track; break; }
      }
    }
    if (coords) {
      segments.push({
        coordinates: coords,
        line: leg.line,
        color: usedTrack?.color || leg.lineColor || '#00f0ff',
        walking: false
      });
    }
  }

  if (segments.length === 0) return null;

  const merged = [];
  segments.forEach((seg, i) => {
    // Avoid a duplicate point at each transfer boundary.
    merged.push(...(i === 0 ? seg.coordinates : seg.coordinates.slice(1)));
  });

  return {
    coordinates: merged,
    segments,
    geometrySource: 'hafas-journey-legs'
  };
}

/**
 * Calculates curved vector route track between two stations/locations (KVB Stadtbahn & Bus)
 */
export async function getPreciseRouteBetween(fromQuery, toQuery) {
  const startSt = findStation(fromQuery);
  const endSt = findStation(toQuery);
  if (!startSt || !endSt) return null;

  const allTracks = getLineTracks('all');
  
  // 1. Check for a direct line connecting startSt and endSt
  for (const track of allTracks) {
    const coords = sliceTrackBetween(track, startSt, endSt);
    if (coords && coords.length > 1) {
      return {
        line: track.line,
        lineName: track.name || `Linie ${track.line}`,
        color: track.color || '#00f0ff',
        mode: track.mode || 'stadtbahn',
        from: { name: startSt.name || startSt.short, lat: startSt.lat, lng: startSt.lng },
        to: { name: endSt.name || endSt.short, lat: endSt.lat, lng: endSt.lng },
        coordinates: coords
      };
    }
  }

  // 2. Multi-leg connection via key hubs
  const candidateHubs = VERIFIED_STATIONS.filter(s => 
    s.id !== startSt.id && s.id !== endSt.id && (s.lines && s.lines.length >= 2)
  );

  let bestTransferRoute = null;
  let shortestTotalPoints = Infinity;

  for (const hub of candidateHubs) {
    let leg1Coords = null;
    let leg1Track = null;
    for (const track of allTracks) {
      const c = sliceTrackBetween(track, startSt, hub);
      if (c && c.length > 1) {
        leg1Coords = c;
        leg1Track = track;
        break;
      }
    }
    if (!leg1Coords) continue;

    let leg2Coords = null;
    let leg2Track = null;
    for (const track of allTracks) {
      const c = sliceTrackBetween(track, hub, endSt);
      if (c && c.length > 1) {
        leg2Coords = c;
        leg2Track = track;
        break;
      }
    }
    if (!leg2Coords) continue;

    const merged = [...leg1Coords, ...leg2Coords.slice(1)];
    if (merged.length < shortestTotalPoints) {
      shortestTotalPoints = merged.length;
      bestTransferRoute = {
        line: `${leg1Track.line} ➔ ${leg2Track.line}`,
        lineName: `${leg1Track.name} ➔ ${leg2Track.name}`,
        color: leg1Track.color || '#00f0ff',
        transferHub: hub.name || hub.short,
        mode: leg1Track.mode || 'stadtbahn',
        from: { name: startSt.name || startSt.short, lat: startSt.lat, lng: startSt.lng },
        to: { name: endSt.name || endSt.short, lat: endSt.lat, lng: endSt.lng },
        coordinates: merged
      };
    }
  }

  if (bestTransferRoute) {
    return bestTransferRoute;
  }

  // 3. Real street-level approximation via TomTom Routing (walking profile) -
  // replaces the previous fabricated interpolation curve. Never invent a
  // line: if TomTom is unconfigured or fails, return null so the caller
  // surfaces a visible "no geometry available" state instead of a fake one.
  const tomtomRoute = await calculateDrivingRoute(startSt, endSt, 'pedestrian');
  if (tomtomRoute && tomtomRoute.coordinates && tomtomRoute.coordinates.length > 1) {
    return {
      from: { name: startSt.name || startSt.short, lat: startSt.lat, lng: startSt.lng },
      to: { name: endSt.name || endSt.short, lat: endSt.lat, lng: endSt.lng },
      coordinates: tomtomRoute.coordinates,
      geometrySource: 'tomtom-approximate',
      distanceMeters: tomtomRoute.distanceMeters,
      durationSeconds: tomtomRoute.durationSeconds
    };
  }

  return null;
}

export { VERIFIED_STATIONS };
