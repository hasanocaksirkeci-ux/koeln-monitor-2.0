import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DB_DIR = process.env.VERCEL ? '/tmp' : join(process.cwd(), 'data');
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = join(DB_DIR, 'koeln_monitor.sqlite');
const db = new DatabaseSync(DB_PATH);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS emergencies (
    id TEXT PRIMARY KEY,
    source TEXT,
    category TEXT,
    title TEXT,
    district TEXT,
    lat REAL,
    lng REAL,
    pub_date TEXT,
    description TEXT,
    link TEXT,
    is_critical INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS punctuality_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    punctuality_score REAL,
    total_tracked INTEGER,
    on_time_count INTEGER,
    delayed_count INTEGER,
    average_delay REAL
  );

  CREATE TABLE IF NOT EXISTS line_metrics (
    line TEXT PRIMARY KEY,
    punctuality REAL,
    active_vehicles INTEGER,
    average_delay REAL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS saved_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    from_name TEXT,
    from_id TEXT,
    to_name TEXT,
    to_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transit_stations (
    id TEXT PRIMARY KEY,
    name TEXT,
    short TEXT,
    lat REAL,
    lng REAL,
    is_underground INTEGER DEFAULT 0,
    lines_json TEXT,
    district TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transit_tracks (
    line TEXT PRIMARY KEY,
    name TEXT,
    color TEXT,
    route_type TEXT,
    is_tunnel INTEGER DEFAULT 0,
    is_bridge INTEGER DEFAULT 0,
    geometry_json TEXT,
    stops_json TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_emergencies_date ON emergencies(pub_date DESC);
  CREATE INDEX IF NOT EXISTS idx_emergencies_district ON emergencies(district);
  CREATE INDEX IF NOT EXISTS idx_transit_stations_underground ON transit_stations(is_underground);
`);

/**
 * Save Transit Stations to SQLite
 */
export function saveTransitStations(stations) {
  const stmt = db.prepare(`
    INSERT INTO transit_stations (id, name, short, lat, lng, is_underground, lines_json, district)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      short = excluded.short,
      lat = excluded.lat,
      lng = excluded.lng,
      is_underground = excluded.is_underground,
      lines_json = excluded.lines_json,
      district = excluded.district,
      updated_at = CURRENT_TIMESTAMP
  `);

  for (const s of stations) {
    stmt.run(
      s.id,
      s.name,
      s.short || s.name,
      s.lat,
      s.lng,
      s.isUnderground ? 1 : 0,
      JSON.stringify(s.lines || []),
      s.district || ''
    );
  }
}

/**
 * Get Transit Stations from SQLite
 */
export function getTransitStationsFromDB() {
  const rows = db.prepare(`SELECT * FROM transit_stations ORDER BY name ASC`).all();
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    short: r.short,
    lat: r.lat,
    lng: r.lng,
    isUnderground: r.is_underground === 1,
    lines: JSON.parse(r.lines_json || '[]'),
    district: r.district
  }));
}

/**
 * Save Transit Tracks to SQLite
 */
export function saveTransitTracks(tracks) {
  const stmt = db.prepare(`
    INSERT INTO transit_tracks (line, name, color, route_type, is_tunnel, is_bridge, geometry_json, stops_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(line) DO UPDATE SET
      name = excluded.name,
      color = excluded.color,
      route_type = excluded.route_type,
      geometry_json = excluded.geometry_json,
      stops_json = excluded.stops_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  for (const t of tracks) {
    stmt.run(
      t.line,
      t.name,
      t.color,
      t.routeType || 'stadtbahn',
      t.isTunnel ? 1 : 0,
      t.isBridge ? 1 : 0,
      JSON.stringify(t.segments || t.coordinates || []),
      JSON.stringify(t.stops || [])
    );
  }
}

/**
 * Get Transit Tracks from SQLite
 */
export function getTransitTracksFromDB() {
  const rows = db.prepare(`SELECT * FROM transit_tracks`).all();
  return rows.map(r => ({
    line: r.line,
    name: r.name,
    color: r.color,
    routeType: r.route_type,
    isTunnel: r.is_tunnel === 1,
    isBridge: r.is_bridge === 1,
    segments: JSON.parse(r.geometry_json || '[]'),
    coordinates: Array.isArray(JSON.parse(r.geometry_json || '[]')[0]) && Array.isArray(JSON.parse(r.geometry_json || '[]')[0][0])
      ? JSON.parse(r.geometry_json || '[]').flat()
      : JSON.parse(r.geometry_json || '[]'),
    stops: JSON.parse(r.stops_json || '[]')
  }));
}

/**
 * Upsert emergencies into the database
 */
export function saveEmergencies(emergencies) {
  const stmt = db.prepare(`
    INSERT INTO emergencies (id, source, category, title, district, lat, lng, pub_date, description, link, is_critical)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      district = excluded.district,
      lat = excluded.lat,
      lng = excluded.lng,
      description = excluded.description,
      is_critical = excluded.is_critical
  `);

  for (const item of emergencies) {
    stmt.run(
      item.id,
      item.source,
      item.category,
      item.title,
      item.district,
      item.lat,
      item.lng,
      item.pubDate,
      item.description,
      item.link,
      item.isCritical ? 1 : 0
    );
  }
}

/**
 * Query emergencies with optional search and limit
 */
export function getEmergenciesFromDB({ limit = 50, district = null, category = null, query = null } = {}) {
  let sql = 'SELECT * FROM emergencies WHERE 1=1';
  const params = [];

  if (district) {
    sql += ' AND LOWER(district) = LOWER(?)';
    params.push(district);
  }

  if (category) {
    sql += ' AND LOWER(category) = LOWER(?)';
    params.push(category);
  }

  if (query) {
    sql += ' AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(district) LIKE ?)';
    const searchPattern = `%${query.toLowerCase()}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  sql += ' ORDER BY pub_date DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(sql);
  return stmt.all(...params).map(row => ({
    id: row.id,
    source: row.source,
    category: row.category,
    title: row.title,
    district: row.district,
    lat: row.lat,
    lng: row.lng,
    pubDate: row.pub_date,
    description: row.description,
    link: row.link,
    isCritical: row.is_critical === 1
  }));
}

/**
 * Record a punctuality snapshot
 */
export function savePunctualitySnapshot(snapshot) {
  const stmt = db.prepare(`
    INSERT INTO punctuality_snapshots (timestamp, punctuality_score, total_tracked, on_time_count, delayed_count, average_delay)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    snapshot.timestamp,
    snapshot.punctualityScore,
    snapshot.totalTracked,
    snapshot.onTimeCount,
    snapshot.delayedCount,
    snapshot.averageDelayMinutes
  );

  if (snapshot.linePerformance && Array.isArray(snapshot.linePerformance)) {
    const lineStmt = db.prepare(`
      INSERT INTO line_metrics (line, punctuality, active_vehicles, average_delay, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(line) DO UPDATE SET
        punctuality = excluded.punctuality,
        active_vehicles = excluded.active_vehicles,
        average_delay = excluded.average_delay,
        updated_at = excluded.updated_at
    `);

    for (const lp of snapshot.linePerformance) {
      lineStmt.run(lp.line, lp.punctuality, lp.activeVehicles, lp.averageDelay, snapshot.timestamp);
    }
  }
}

/**
 * Get recent punctuality history
 */
export function getPunctualityHistory(limit = 24) {
  const stmt = db.prepare(`
    SELECT * FROM punctuality_snapshots ORDER BY id DESC LIMIT ?
  `);
  return stmt.all(limit).reverse();
}

/**
 * Get saved routes
 */
export function getSavedRoutes() {
  const stmt = db.prepare(`SELECT * FROM saved_routes ORDER BY id DESC`);
  return stmt.all();
}

/**
 * Add a saved route
 */
export function addSavedRoute(fromName, fromId, toName, toId, name = null) {
  const routeName = name || `${fromName} ➔ ${toName}`;
  const stmt = db.prepare(`
    INSERT INTO saved_routes (name, from_name, from_id, to_name, to_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(routeName, fromName, fromId, toName, toId);
  return getSavedRoutes();
}

export default {
  saveEmergencies,
  getEmergenciesFromDB,
  savePunctualitySnapshot,
  getPunctualityHistory,
  getSavedRoutes,
  addSavedRoute
};
