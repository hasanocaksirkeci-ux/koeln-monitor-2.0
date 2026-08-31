# SOP: SQLite Database & Persistent Storage (`data/koeln_monitor.sqlite`)

## Goal
Provide a zero-dependency, ultra-fast embedded SQLite storage layer using native `node:sqlite` in Node.js 24.

## Tables
1. `emergencies`: Persistent archive of all police, fire, and rescue incident reports with full text search capability.
2. `punctuality_snapshots`: Periodic snapshots of Cologne public transit on-time rates.
3. `line_metrics`: Current punctuality % and average delay for each KVB line (1-18, bus, S-Bahn).
4. `saved_routes`: Stored user commute routes (e.g. Florastr. ➔ Neumarkt).

## Invariants
- Thread-safe synchronous queries via `DatabaseSync`.
- Schema initialized on startup with `IF NOT EXISTS`.
- Auto-creation of `data/` directory.
