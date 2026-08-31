# Task Plan: Köln Live-Monitor (B.L.A.S.T. City-Plattform & Super-Monitor)

## Phase 1: Blueprint (Vision & Logic)
- [x] Eliminate "API KEY REQUIRED" watermark (Switch to Esri Dark Canvas, OSM, Esri World Imagery)
- [x] Define GPS Geolocation, 3D/2.5D Drone Tilt Mode, and Zoom Constraints (`minZoom: 11`, `maxBounds`)
- [x] Define Emergency & Police Radar (`/api/emergencies`) with 49+ Veedel Geocoding
- [x] Define KVB Rad / Nextbike Live-Tracking (`/api/bikes`) for 1,947 stations
- [x] Define SQLite Database Architecture with `node:sqlite` for persistent archive & analytics
- [x] Define Flightradar-style features: 3D Cockpit Follow Mode, km/h Speedometer, Route Highlight

## Phase 2: Link (Connectivity & Database Layer)
- [ ] Build `tools/db.js` using native `node:sqlite` for incident archive, line stats, and saved routes
- [ ] Build `tools/cologne-emergencies.js` for Polizei Köln RSS parsing & Veedel geocoding
- [ ] Build `tools/kvb-bikes.js` for Nextbike KVB Rad live feed
- [ ] Build `tools/analytics.js` for live punctuality scoring & line delay tracking

## Phase 3: Architect (A.N.T. 3-Layer Build)
- [ ] Create SOPs in `architecture/`:
  - `architecture/sop_database.md`
  - `architecture/sop_emergencies.md`
  - `architecture/sop_bikes.md`
- [ ] Integrate new API endpoints into `server.js`:
  - `GET /api/emergencies` (Searchable, filterable)
  - `GET /api/bikes` (KVB Rad stations)
  - `GET /api/analytics` (Punctuality index & line metrics)
  - `GET /api/saved-routes` & `POST /api/saved-routes`

## Phase 4: Stylize (Frontend UI/UX & Pro City-Platform)
- [ ] Map View Switcher: `🌙 Dunkel | ☀️ Hell | 🛰️ Satellit / GPS | 🏢 3D Perspektive`
- [ ] GPS Tracking ("Mein Standort") with live user position & accuracy radius
- [ ] Map Zoom Limits (`minZoom: 11`, `maxBounds`)
- [ ] Flightradar Mode:
  - 🎥 **Cockpit / Follow-Cam**: Locks onto a train and glides along the track in 3D
  - ⚡ **Live Tachometer (km/h)** & Next Stop ETA
  - 🌈 **Full Route Trajectory Highlight** on vehicle click
- [ ] 🚨 **Blaulicht-Layer & Blaulicht-Tab**:
  - Animated pulsing siren markers on the map
  - Full searchable incident archive with Veedel filters
- [ ] 🚲 **KVB-Rad Layer & Tab**:
  - Bike station markers with available bike count badges
- [ ] 📊 **Pünktlichkeit & Analytics Dashboard Tab**:
  - Overall network score, delay breakdown, and line ranking
- [ ] Remove all watermarked tile references in CSS/JS

## Phase 5: Trigger & Verification
- [ ] Automated Test Suite (`test_api_endpoints.js`) verifying all 10 API endpoints + SQLite
- [ ] Headless Chrome Browser Verification:
  - Verify clean, non-watermarked tiles in all 3 modes
  - Test 3D perspective tilt and Cockpit Follow-Cam
  - Test Blaulicht pins & drawer
  - Test KVB-Rad layer
  - Test GPS user location button
- [ ] Update `walkthrough.md` with screenshots and summary
