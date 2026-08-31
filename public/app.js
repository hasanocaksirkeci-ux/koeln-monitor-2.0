import { ICONS, getIcon } from './icons.js';

/**
 * Köln Live-Monitor: Vexto-Grade Mission Control Application Engine
 * Layer 2 & 4: Navigation, High-Def 3-Mode Leaflet Map, Track-Snapping Radar, Blaulicht, KVB-Rad & Köln AI
 */

// ==========================================================================
// 1. Global State
// ==========================================================================
const state = {
  theme: localStorage.getItem('koeln_theme') || 'dark',
  activeTab: 'map',
  mapMode: 'dark', // 'dark' | 'light' | 'satellite'
  is3dTilted: false,

  // Map Engine & Layers
  map: null,
  baseTileLayer: null,
  labelTileLayer: null,
  radarTimer: null,
  radarCountdown: 6,
  vehiclesMap: new Map(), // tripId -> { marker, lastLat, lastLng, lastTime, speed, heading, snapped }
  
  // Layer Groups
  stationMarkersGroup: null,
  tracksBahnGroup: null,
  tracksBusGroup: null,
  emergencyMarkersGroup: null,
  bikeMarkersGroup: null,
  parkingMarkersGroup: null,
  pegelGroup: null,
  trafficFlowLayer: null,
  trafficIncidentsGroup: null,
  highlightedRouteLayer: null,
  aiRouteLayer: null,
  aiStartMarker: null,
  aiEndMarker: null,
  aiFocusMarker: null,
  userLocationMarker: null,
  userAccuracyCircle: null,

  // Transit Modes & Line Filters
  selectedTransitMode: 'all', // 'all' | 'bahn' | 'bus'
  selectedLineFilter: 'all', // 'all' | '1'..'18' | 'bus'

  // Map Filter Toggles
  filters: {
    trains: true,          // KVB Stadtbahnen Live-Radar
    buses: true,           // KVB Busse Live-Radar
    tracksBahn: true,      // Stadtbahn-Netz & U-Bahn-Tunnel
    tracksBus: true,       // KVB Bus-Netz & Korridore
    stations: true,        // Haltestellen & U-Bahnhöfe
    emergencies: true,     // Polizei & Feuerwehr
    bikes: false,          // KVB-Rad
    traffic: true,         // TomTom Live-Verkehr
    parking: true,         // Parkleitsystem
    pegel: true            // Rheinpegel-Standort
  },

  // Flightradar Follow-Cam Mode
  followedVehicle: null, // tripId if locked

  // Active Station & Departures
  activeStation: {
    id: '900000304',
    name: 'Köln Florastr.',
    short: 'Florastr.',
    lat: 50.964505,
    lng: 6.953696,
    lines: ['12', '15']
  },
  departures: [],
  depFilter: 'all',
  drawerDepFilter: 'all',
  depCountdown: 30,
  depTimer: null,

  // Blaulicht & Emergencies State
  emergencies: [],
  activeEmergencyFilter: 'all',

  // KVB-Rad State
  bikesData: null,

  // Analytics & SQLite Saved Routes
  analytics: null,
  savedRoutes: [],

  // Favorites
  favorites: JSON.parse(localStorage.getItem('koeln_favs') || '[]'),

  // City Data
  verifiedStations: [],
  lineTracks: [],
  disruptions: null,
  widgets: null
};

// Default Favorites if empty
if (state.favorites.length === 0) {
  state.favorites = [
    { id: '900000304', name: 'Florastr.' },
    { id: '900000002', name: 'Neumarkt' },
    { id: '900000752', name: 'Dom/Hbf' },
    { id: '900000035', name: 'Ebertplatz' },
    { id: '900000001', name: 'Heumarkt' },
    { id: '900000027', name: 'Rudolfplatz' },
    { id: '900000030', name: 'Friesenplatz' },
    { id: '900000570', name: 'Wiener Platz' }
  ];
}

// ==========================================================================
// 2. Curated 3 High-End Basemaps (Watermark-Free & Unthrottled)
// ==========================================================================
const BASEMAPS = {
  dark: {
    name: 'Cyber Dunkel',
    base: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, HERE, Garmin',
    maxNativeZoom: 16,
    maxZoom: 19
  },
  light: {
    name: 'Studio Hell',
    base: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, HERE, Garmin',
    maxNativeZoom: 16,
    maxZoom: 19
  },
  satellite: {
    name: 'GPS Satellit HD',
    base: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    labels: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxNativeZoom: 19,
    maxZoom: 19
  }
};

function triggerHaptic(ms = 8) {
  if (typeof window !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(ms);
    } catch (e) {}
  }
}

// ==========================================================================
// 3. Application Initialization
// ==========================================================================
function initApp() {
  initTheme();
  initClock();
  initTabs();
  initLeafletMap();
  initTransitHudBar();
  initLineInspector();
  initGlobalSearch();
  initDeparturesView();
  initEmergenciesView();
  initBikesView();
  initRoutePlanner();
  initDisruptionsView();
  initAnalyticsView();
  initWidgetsView();
  initAIChatView();
  initMapFloatingAI();
  initSwipeGestures();

  // Initial Data Loads
  loadLineTracksAndStations();
  loadEmergencies();
  loadTomTomTraffic();
  loadBikes();
  loadAnalytics();
  loadDisruptions();
  loadWidgets();
  loadSavedRoutes();
  startRadarLoop();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// ==========================================================================
// 4. Mission Control Header Clock & Theme
// ==========================================================================
function initClock() {
  const clockEl = document.getElementById('header-clock');
  function update() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('de-DE', { hour12: false });
  }
  update();
  setInterval(update, 1000);
}

function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('koeln_theme', state.theme);
  
  if (state.mapMode !== 'satellite') {
    setBasemap(state.theme === 'dark' ? 'dark' : 'light');
  }
}

function setBasemap(mode) {
  if (!state.map) return;
  if (!BASEMAPS[mode]) mode = 'dark';
  state.mapMode = mode;

  // Update Segmented Control UI
  document.querySelectorAll('.seg-btn').forEach(btn => {
    const btnMode = btn.getAttribute('data-map-mode');
    const isActive = btnMode === mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });

  const config = BASEMAPS[mode];

  if (state.baseTileLayer) {
    state.map.removeLayer(state.baseTileLayer);
  }
  if (state.labelTileLayer) {
    state.map.removeLayer(state.labelTileLayer);
  }

  state.baseTileLayer = L.tileLayer(config.base, {
    attribution: config.attribution,
    maxNativeZoom: config.maxNativeZoom || 16,
    maxZoom: config.maxZoom || 19,
    subdomains: 'abc'
  }).addTo(state.map);

  if (config.labels) {
    state.labelTileLayer = L.tileLayer(config.labels, {
      maxNativeZoom: config.maxNativeZoom || 16,
      maxZoom: config.maxZoom || 19,
      pane: 'overlayPane'
    }).addTo(state.map);
  }
}

// ==========================================================================
// 5. Left Navigation Rail & Operations Feed Switching
// ==========================================================================
function initTabs() {
  const tabBtns = document.querySelectorAll('.rail-tab, .dock-tab');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  const brandHome = document.getElementById('brand-home-btn');
  if (brandHome) {
    brandHome.addEventListener('click', () => switchTab('map'));
  }

  // Live Vehicle Stream Line Filters
  document.querySelectorAll('.lchip[data-lfilter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lchip[data-lfilter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.vehicleStreamFilter = btn.getAttribute('data-lfilter');
      updateVehicleStreamList();
    });
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;
  triggerHaptic(8);
  
  // Update Rail & Dock active classes
  document.querySelectorAll('.rail-tab, .dock-tab').forEach(b => {
    const isActive = b.getAttribute('data-tab') === tabId;
    b.classList.toggle('active', isActive);
  });

  // Update Sidebar Feeds
  const feedId = tabId === 'map' ? 'sidebar-feed-radar' : `sidebar-feed-${tabId}`;
  document.querySelectorAll('.sidebar-feed-panel').forEach(p => {
    p.classList.toggle('active', p.id === feedId);
  });

  // Mobile sidebar drawer handling
  const sidebar = document.querySelector('.dashboard-sidebar');
  if (sidebar && window.innerWidth <= 900) {
    if (tabId === 'map') {
      sidebar.classList.remove('mobile-open');
    } else {
      sidebar.classList.add('mobile-open');
    }
  }

  if (tabId === 'map' && state.map) {
    setTimeout(() => {
      state.map.invalidateSize();
    }, 100);
  } else if (tabId === 'departures') {
    fetchDepartures(state.activeStation.id);
  } else if (tabId === 'emergencies') {
    loadEmergencies();
  } else if (tabId === 'bikes') {
    loadBikes();
  } else if (tabId === 'disruptions') {
    loadDisruptions();
  } else if (tabId === 'analytics') {
    loadAnalytics();
    loadSavedRoutes();
  } else if (tabId === 'widgets') {
    loadWidgets();
  } else if (tabId === 'ai') {
    document.getElementById('ai-chat-input')?.focus();
  }
}

// ==========================================================================
// 6. Leaflet 2D/3D Map Engine & Real-Time Radar
// ==========================================================================
function initLeafletMap() {
  const mapElement = document.getElementById('leaflet-map');
  if (!mapElement) return;

  const COLOGNE_CENTER = [50.9380, 6.9580];
  const COLOGNE_BOUNDS = [
    [50.60, 6.55], // Southwest
    [51.25, 7.35]  // Northeast
  ];

  state.map = L.map('leaflet-map', {
    center: COLOGNE_CENTER,
    zoom: 13,
    minZoom: 11, // Geofenced Zoom-Limit
    maxZoom: 18,
    maxBounds: COLOGNE_BOUNDS,
    maxBoundsViscosity: 0.9,
    zoomControl: false
  });

  L.control.zoom({ position: 'bottomright' }).addTo(state.map);

  // Panes hierarchy
  state.map.createPane('tracksPane');
  state.map.getPane('tracksPane').style.zIndex = 350;

  state.map.createPane('stationsPane');
  state.map.getPane('stationsPane').style.zIndex = 450;

  state.map.createPane('vehiclesPane');
  state.map.getPane('vehiclesPane').style.zIndex = 650;

  state.map.createPane('emergenciesPane');
  state.map.getPane('emergenciesPane').style.zIndex = 800;

  // Initialize Default Clean Basemap
  setBasemap(state.theme === 'dark' ? 'dark' : 'light');

  // Layer Groups
  state.tracksBahnGroup = L.layerGroup();
  if (state.filters.tracksBahn) state.tracksBahnGroup.addTo(state.map);

  state.tracksBusGroup = L.layerGroup();
  if (state.filters.tracksBus) state.tracksBusGroup.addTo(state.map);

  state.stationMarkersGroup = L.layerGroup();
  if (state.filters.stations) state.stationMarkersGroup.addTo(state.map);

  state.emergencyMarkersGroup = L.layerGroup();
  if (state.filters.emergencies) state.emergencyMarkersGroup.addTo(state.map);

  state.trafficIncidentsGroup = L.layerGroup();
  if (state.filters.traffic) state.trafficIncidentsGroup.addTo(state.map);

  state.bikeMarkersGroup = L.layerGroup();
  if (state.filters.bikes) state.bikeMarkersGroup.addTo(state.map);

  state.parkingMarkersGroup = L.layerGroup();
  if (state.filters.parking) state.parkingMarkersGroup.addTo(state.map);

  state.pegelGroup = L.layerGroup();
  if (state.filters.pegel) state.pegelGroup.addTo(state.map);

  // Segmented Control Switcher
  document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const mode = e.currentTarget.getAttribute('data-map-mode');
      setBasemap(mode);
    });
  });

  // 3D Tilt Toggle Button
  const tiltBtn = document.getElementById('toggle-3d-btn');
  const mapWrapper = document.getElementById('map-3d-wrapper');
  if (tiltBtn && mapWrapper) {
    tiltBtn.addEventListener('click', () => {
      state.is3dTilted = !state.is3dTilted;
      tiltBtn.classList.toggle('active', state.is3dTilted);
      mapWrapper.classList.toggle('tilt-3d', state.is3dTilted);
      setTimeout(() => state.map?.invalidateSize(), 300);
    });
  }

  // GPS Tracking Button
  const gpsBtn = document.getElementById('gps-track-btn');
  if (gpsBtn) {
    gpsBtn.addEventListener('click', toggleGPSTracking);
  }

  // Center Cologne button
  const centerBtn = document.getElementById('center-cologne-btn');
  if (centerBtn) {
    centerBtn.addEventListener('click', () => {
      exitFollowCam();
      state.map.flyTo(COLOGNE_CENTER, 13);
    });
  }

  // Refresh radar button
  const refreshBtn = document.getElementById('refresh-radar-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchLiveRadar();
    });
  }

  // Cockpit Exit Button
  const cockpitExitBtn = document.getElementById('cockpit-exit-btn');
  if (cockpitExitBtn) {
    cockpitExitBtn.addEventListener('click', exitFollowCam);
  }

  // Vehicle Drawer Close
  const vdrawerCloseBtn = document.getElementById('vdrawer-close-btn');
  if (vdrawerCloseBtn) {
    vdrawerCloseBtn.addEventListener('click', () => {
      document.getElementById('vehicle-drawer').style.display = 'none';
    });
  }

  // Station Drawer Close
  const drawerCloseBtn = document.getElementById('drawer-close-btn');
  if (drawerCloseBtn) {
    drawerCloseBtn.addEventListener('click', closeStationDrawer);
  }

  // Drawer Favorite & Route Buttons
  const drawerFavBtn = document.getElementById('drawer-fav-btn');
  if (drawerFavBtn) {
    drawerFavBtn.addEventListener('click', () => {
      toggleFavorite(state.activeStation);
      updateDrawerFavIcon();
    });
  }

  const drawerRouteBtn = document.getElementById('drawer-route-btn');
  if (drawerRouteBtn) {
    drawerRouteBtn.addEventListener('click', () => {
      closeStationDrawer();
      switchTab('routes');
      const toInput = document.getElementById('route-to-input');
      if (toInput) toInput.value = state.activeStation.name;
    });
  }

  // Drawer filter pills
  document.querySelectorAll('[data-drawer-filter]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-drawer-filter]').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      state.drawerDepFilter = e.currentTarget.getAttribute('data-drawer-filter');
      renderDrawerDepartures();
    });
  });

  // Layer Filter Toggles
  initMapLayerFilters();
}

function initTransitHudBar() {
  // Mode toggles (Alle, Bahnen, Busse)
  document.querySelectorAll('.thud-mode-btn, [data-transit-mode]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.currentTarget;
      document.querySelectorAll('.thud-mode-btn, [data-transit-mode]').forEach(b => b.classList.remove('active'));
      const mode = targetBtn.getAttribute('data-transit-mode');
      targetBtn.classList.add('active');
      state.selectedTransitMode = mode;

      if (mode === 'all') {
        state.filters.trains = true;
        state.filters.buses = true;
        state.filters.tracksBahn = true;
        state.filters.tracksBus = true;
      } else if (mode === 'bahn') {
        state.filters.trains = true;
        state.filters.buses = false;
        state.filters.tracksBahn = true;
        state.filters.tracksBus = false;
      } else if (mode === 'bus') {
        state.filters.trains = false;
        state.filters.buses = true;
        state.filters.tracksBahn = false;
        state.filters.tracksBus = true;
      }

      // Sync layer checkboxes
      const chkTrains = document.getElementById('chk-trains');
      const chkBuses = document.getElementById('chk-buses');
      const chkTracksBahn = document.getElementById('chk-tracks-bahn');
      const chkTracksBus = document.getElementById('chk-tracks-bus');
      if (chkTrains) chkTrains.checked = state.filters.trains;
      if (chkBuses) chkBuses.checked = state.filters.buses;
      if (chkTracksBahn) chkTracksBahn.checked = state.filters.tracksBahn;
      if (chkTracksBus) chkTracksBus.checked = state.filters.tracksBus;

      if (state.tracksBahnGroup) {
        if (state.filters.tracksBahn) state.map.addLayer(state.tracksBahnGroup);
        else state.map.removeLayer(state.tracksBahnGroup);
      }
      if (state.tracksBusGroup) {
        if (state.filters.tracksBus) state.map.addLayer(state.tracksBusGroup);
        else state.map.removeLayer(state.tracksBusGroup);
      }

      applyVehicleVisibility();
      updateVehicleStreamList();
    });
  });

  // Line selector pills
  document.querySelectorAll('.tline-pill').forEach(pill => {
    pill.addEventListener('click', async (e) => {
      const targetPill = e.currentTarget;
      const line = targetPill.getAttribute('data-line');
      const isAlreadyActive = targetPill.classList.contains('active');

      document.querySelectorAll('.tline-pill').forEach(p => p.classList.remove('active'));

      if (isAlreadyActive) {
        state.selectedLineFilter = 'all';
        applyVehicleVisibility();
        closeLineInspector();
        return;
      }

      targetPill.classList.add('active');
      state.selectedLineFilter = line;
      applyVehicleVisibility();

      await openLineInspector(line);
    });
  });
}

function initMapLayerFilters() {
  const layerCheckboxes = [
    { id: 'chk-trains', layer: 'trains', isVehicle: true },
    { id: 'chk-buses', layer: 'buses', isVehicle: true },
    { id: 'chk-tracks-bahn', layer: 'tracksBahn', group: () => state.tracksBahnGroup },
    { id: 'chk-tracks-bus', layer: 'tracksBus', group: () => state.tracksBusGroup },
    { id: 'chk-stations', layer: 'stations', group: () => state.stationMarkersGroup },
    { id: 'chk-emergencies', layer: 'emergencies', group: () => state.emergencyMarkersGroup },
    { id: 'chk-bikes', layer: 'bikes', group: () => state.bikeMarkersGroup },
    { id: 'chk-traffic', layer: 'traffic', isTraffic: true },
    { id: 'chk-parking', layer: 'parking', group: () => state.parkingMarkersGroup },
    { id: 'chk-pegel', layer: 'pegel', group: () => state.pegelGroup }
  ];

  const layersBtn = document.getElementById('map-layers-btn');
  const layersMenu = document.getElementById('map-layers-menu');

  if (layersBtn && layersMenu) {
    layersBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      layersMenu.classList.toggle('show');
      layersMenu.classList.toggle('open');
    });

    layersMenu.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => {
      layersMenu.classList.remove('show');
      layersMenu.classList.remove('open');
    });
  }

  layerCheckboxes.forEach(({ id, layer, isVehicle, isTraffic, group }) => {
    const chk = document.getElementById(id);
    if (!chk) return;

    chk.checked = !!state.filters[layer];

    chk.addEventListener('change', () => {
      state.filters[layer] = chk.checked;
      updateActiveLayersCount();

      if (isVehicle) {
        applyVehicleVisibility();
      } else if (isTraffic) {
        if (state.trafficFlowLayer) {
          if (state.filters.traffic) state.map.addLayer(state.trafficFlowLayer);
          else state.map.removeLayer(state.trafficFlowLayer);
        }
        if (state.trafficIncidentsGroup) {
          if (state.filters.traffic) state.map.addLayer(state.trafficIncidentsGroup);
          else state.map.removeLayer(state.trafficIncidentsGroup);
        }
      } else {
        const g = group?.();
        if (g) {
          if (state.filters[layer]) state.map.addLayer(g);
          else state.map.removeLayer(g);
        }
      }
    });
  });

  updateActiveLayersCount();
}

function updateActiveLayersCount() {
  const badge = document.getElementById('active-layers-badge');
  if (!badge) return;
  const count = document.querySelectorAll('#map-layers-menu input[type="checkbox"]:checked').length;
  badge.textContent = count;
}

function isVehicleVisible(v) {
  if (!v) return false;
  const isBahn = v.mode === 'stadtbahn' || v.product === 'stadtbahn';
  const isBus = v.mode === 'bus' || v.product === 'bus';

  if (isBahn && !state.filters.trains) return false;
  if (isBus && !state.filters.buses) return false;

  if (state.selectedLineFilter !== 'all') {
    if (state.selectedLineFilter === 'bus') {
      if (!isBus) return false;
    } else {
      const cleanLine = String(v.line || '').replace(/^(LINIE|STADTBAHN|STRASSENBAHN|BUS|SB)\s*/i, '').trim();
      if (cleanLine !== state.selectedLineFilter) return false;
    }
  }

  return true;
}

function applyVehicleVisibility() {
  for (const [tripId, record] of state.vehiclesMap.entries()) {
    const v = record.data;
    if (!v) continue;
    const shouldShow = isVehicleVisible(v);
    if (shouldShow) {
      if (!state.map.hasLayer(record.marker)) record.marker.addTo(state.map);
    } else {
      if (state.map.hasLayer(record.marker)) state.map.removeLayer(record.marker);
    }
  }
}

// ==========================================================================
// 7. Spatial Track-Snapping Engine (Kein Fliegen über Häuser)
// ==========================================================================
function findClosestPointOnSegment(p, a, b) {
  const x = p[0], y = p[1];
  const x1 = a[0], y1 = a[1];
  const x2 = b[0], y2 = b[1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { point: a, distSq: (x - x1) * (x - x1) + (y - y1) * (y - y1), heading: 0 };
  let t = ((x - x1) * dx + (y - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const distSq = (x - projX) * (x - projX) + (y - projY) * (y - projY);
  const heading = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  return { point: [projX, projY], distSq, heading };
}

function snapVehicleToTrack(lat, lng, lineName, product) {
  if (!lat || !lng) return { lat, lng, bearing: 0, snapped: false };
  if (!state.lineTracks || state.lineTracks.length === 0) return { lat, lng, bearing: 0, snapped: false };

  const cleanLine = String(lineName || '').replace(/^(LINIE|STRASSENBAHN|STADTBAHN|BUS|S)\s*/i, '').trim();
  const matchedTrack = state.lineTracks.find(t => String(t.line).toUpperCase() === cleanLine.toUpperCase());
  
  if (matchedTrack && matchedTrack.coordinates && matchedTrack.coordinates.length > 1) {
    const coords = matchedTrack.coordinates;
    let closestPoint = null;
    let minDistSq = Infinity;
    let bearing = 0;

    for (let i = 0; i < coords.length - 1; i++) {
      const segRes = findClosestPointOnSegment([lat, lng], coords[i], coords[i + 1]);
      if (segRes.distSq < minDistSq) {
        minDistSq = segRes.distSq;
        closestPoint = segRes.point;
        bearing = segRes.heading;
      }
    }

    // ~250 meters max snapping threshold in coordinate space squared
    if (minDistSq < 0.00003 && closestPoint) {
      return { lat: closestPoint[0], lng: closestPoint[1], bearing, snapped: true };
    }
  }

  return { lat, lng, bearing: 0, snapped: false };
}

// ==========================================================================
// 8. Live Radar Loop & Vehicle Marker Rendering
// ==========================================================================
function startRadarLoop() {
  fetchLiveRadar();
  
  state.radarTimer = setInterval(() => {
    state.radarCountdown--;
    const countdownEl = document.getElementById('radar-countdown-text');
    if (countdownEl) countdownEl.textContent = `${state.radarCountdown}s`;

    if (state.radarCountdown <= 0) {
      state.radarCountdown = 6;
      fetchLiveRadar();
    }
  }, 1000);
}

async function fetchLiveRadar() {
  try {
    const res = await fetch('/api/radar');
    if (!res.ok) throw new Error('Radar HTTP ' + res.status);
    const data = await res.json();
    renderLiveVehicles(data.vehicles || []);
  } catch (err) {
    console.error('Radar poll error:', err.message);
  }
}

function getVextoVehicleMarkerHtml(v, heading = 0) {
  const color = v.lineColor || '#00f0ff';
  const cleanLine = escapeHtml(v.line || '');
  return `
    <div class="vexto-vehicle-marker" style="--marker-color: ${color};">
      <div class="vexto-marker-halo"></div>
      <div class="vexto-marker-pin">
        <span>${cleanLine}</span>
      </div>
      <div class="vexto-marker-arrow" style="transform: translateX(-50%) rotate(${Math.round(heading)}deg);"></div>
    </div>
  `;
}

function renderLiveVehicles(vehicles) {
  const currentTripIds = new Set();
  const now = Date.now();

  let stadtbahnCount = 0;
  let busCount = 0;

  vehicles.forEach(v => {
    currentTripIds.add(v.tripId);

    const isBahn = v.mode === 'stadtbahn' || v.product === 'stadtbahn';
    if (isBahn) stadtbahnCount++;
    else busCount++;

    // Spatial Track Snapping
    const snappedPos = snapVehicleToTrack(v.lat, v.lng, v.line, v.mode || v.product);
    const effectiveLat = snappedPos.snapped ? snappedPos.lat : v.lat;
    const effectiveLng = snappedPos.snapped ? snappedPos.lng : v.lng;

    const existing = state.vehiclesMap.get(v.tripId);
    let speedKmH = 34; // Default cruising speed

    if (existing) {
      const timeDeltaHours = (now - existing.lastTime) / 3600000;
      if (timeDeltaHours > 0 && timeDeltaHours < 0.01) {
        const distKm = getDistanceFromLatLonInKm(existing.lastLat, existing.lastLng, effectiveLat, effectiveLng);
        const calculatedSpeed = Math.round(distKm / timeDeltaHours);
        if (calculatedSpeed > 0 && calculatedSpeed < 90) {
          speedKmH = calculatedSpeed;
        }
      }

      let headingDeg = snappedPos.bearing || existing.heading || 0;
      const dLat = effectiveLat - existing.lastLat;
      const dLng = effectiveLng - existing.lastLng;
      if (!snappedPos.snapped && (Math.abs(dLat) > 0.00002 || Math.abs(dLng) > 0.00002)) {
        const angle = Math.atan2(dLng, dLat) * 180 / Math.PI;
        headingDeg = (angle + 360) % 360;
      }
      existing.heading = headingDeg;

      existing.marker.setIcon(L.divIcon({
        className: 'vexto-marker-wrapper',
        html: getVextoVehicleMarkerHtml(v, headingDeg),
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      }));

      existing.marker.setLatLng([effectiveLat, effectiveLng]);
      existing.lastLat = effectiveLat;
      existing.lastLng = effectiveLng;
      existing.lastTime = now;
      existing.speed = speedKmH;
      existing.data = v;

      if (isVehicleVisible(v)) {
        if (!state.map.hasLayer(existing.marker)) existing.marker.addTo(state.map);
      } else {
        if (state.map.hasLayer(existing.marker)) state.map.removeLayer(existing.marker);
      }
    } else {
      const customIcon = L.divIcon({
        className: 'vexto-marker-wrapper',
        html: getVextoVehicleMarkerHtml(v, snappedPos.bearing || 0),
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([effectiveLat, effectiveLng], {
        icon: customIcon,
        pane: 'vehiclesPane',
        zIndexOffset: 500
      });

      marker.on('click', () => {
        openVehicleDetails(v, speedKmH);
      });

      if (isVehicleVisible(v)) {
        marker.addTo(state.map);
      }

      state.vehiclesMap.set(v.tripId, {
        marker,
        lastLat: effectiveLat,
        lastLng: effectiveLng,
        lastTime: now,
        speed: speedKmH,
        heading: snappedPos.bearing || 0,
        data: v
      });
    }

    if (state.followedVehicle === v.tripId) {
      updateCockpitCam(v, speedKmH, effectiveLat, effectiveLng);
    }
  });

  // Cleanup vanished vehicles
  for (const [tripId, record] of state.vehiclesMap.entries()) {
    if (!currentTripIds.has(tripId)) {
      state.map.removeLayer(record.marker);
      state.vehiclesMap.delete(tripId);
    }
  }

  // Update Telemetry Header & HUD
  const totalCount = vehicles.length;
  const totalHeaderEl = document.getElementById('vehicle-count-header');
  if (totalHeaderEl) totalHeaderEl.textContent = totalCount;
  const hudStadtbahnEl = document.getElementById('hud-stadtbahn-count');
  if (hudStadtbahnEl) hudStadtbahnEl.textContent = stadtbahnCount;
  const hudBusEl = document.getElementById('hud-bus-count');
  if (hudBusEl) hudBusEl.textContent = busCount;

  // Update Left Sidebar Live Vehicle Feed
  updateVehicleStreamList();
}

function updateVehicleStreamList() {
  const container = document.getElementById('vehicle-stream-list');
  if (!container) return;

  const filter = state.vehicleStreamFilter || 'all';
  const records = Array.from(state.vehiclesMap.values()).filter(r => {
    const v = r.data;
    if (!v) return false;
    const isBahn = v.mode === 'stadtbahn' || v.product === 'stadtbahn';
    const isBus = v.mode === 'bus' || v.product === 'bus';
    if (filter === 'bahn') return isBahn;
    if (filter === 'bus') return isBus;
    return true;
  });

  if (records.length === 0) {
    container.innerHTML = `<div class="py-6 text-center text-muted"><span style="font-size:0.8rem;">Keine Fahrzeuge im Filter aktiv</span></div>`;
    return;
  }

  // Sort by line number ascending
  records.sort((a, b) => {
    const lineA = parseInt(a.data?.line) || 999;
    const lineB = parseInt(b.data?.line) || 999;
    return lineA - lineB;
  });

  // Render top 40 vehicles
  const html = records.slice(0, 45).map(r => {
    const v = r.data;
    const isSelected = state.followedVehicle === v.tripId;
    const delay = v.nextStop?.delayMinutes || 0;
    const delayClass = delay <= 0 ? 'ontime' : 'delayed';
    const delayText = delay <= 0 ? 'Pünktlich' : `+${delay}m`;
    const color = v.lineColor || '#00f0ff';
    const textColor = v.lineTextColor || '#fff';

    return `
      <div class="vehicle-stream-card ${isSelected ? 'selected' : ''}" data-trip-id="${escapeHtml(v.tripId)}">
        <div class="vcard-top-row">
          <div class="vcard-left">
            <span class="line-badge" style="background: ${color}; color: ${textColor};">${escapeHtml(v.line || '')}</span>
            <div class="vcard-dest">${escapeHtml(v.direction || 'In Fahrt')}</div>
          </div>
          <span class="vcard-delay-tag ${delayClass}">${delayText}</span>
        </div>
        <div class="vcard-meta-row">
          <span class="text-muted">${escapeHtml(v.nextStop?.name || 'In Fahrt')}</span>
          <span class="vcard-speed mono">${r.speed || 34} km/h</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;

  // Add click handlers
  container.querySelectorAll('.vehicle-stream-card').forEach(card => {
    card.addEventListener('click', () => {
      const tripId = card.getAttribute('data-trip-id');
      const rec = state.vehiclesMap.get(tripId);
      if (rec && state.map) {
        state.map.setView([rec.lastLat, rec.lastLng], 15, { animate: true });
        openVehicleDetails(rec.data, rec.speed);
      }
    });
  });
}

function openVehicleDetails(v, speed) {
  const drawer = document.getElementById('vehicle-drawer');
  if (!drawer) return;

  const badge = document.getElementById('vdrawer-badge');
  if (badge) {
    badge.textContent = v.line;
    badge.style.background = v.lineColor || '#00f0ff';
    badge.style.color = v.lineTextColor || '#fff';
  }

  const nameEl = document.getElementById('vdrawer-line-name');
  if (nameEl) nameEl.textContent = `${v.product === 'bus' ? 'Bus' : 'Stadtbahn'} Linie ${v.line}`;
  const destEl = document.getElementById('vdrawer-destination');
  if (destEl) destEl.textContent = `Richtung ${v.direction || 'Unbekannt'}`;
  const nextStopEl = document.getElementById('vdrawer-next-stop');
  if (nextStopEl) nextStopEl.textContent = v.nextStop?.name || 'In Fahrt';
  
  const delay = v.nextStop?.delayMinutes || 0;
  const delayEl = document.getElementById('vdrawer-delay-status');
  if (delayEl) {
    if (delay <= 0) {
      delayEl.textContent = 'Pünktlich (±0 Min)';
      delayEl.className = 'vstat-value mono text-emerald';
    } else {
      delayEl.textContent = `+${delay} Min. Verspätung`;
      delayEl.className = 'vstat-value mono text-rose';
    }
  }

  const speedEl = document.getElementById('vdrawer-speed');
  if (speedEl) speedEl.textContent = `${speed} km/h`;

  const cockpitBtn = document.getElementById('vdrawer-cockpit-btn');
  if (cockpitBtn) {
    cockpitBtn.onclick = () => startFollowCam(v.tripId);
  }

  const highlightBtn = document.getElementById('vdrawer-highlight-btn');
  if (highlightBtn) {
    highlightBtn.onclick = () => highlightLineTrack(v.line);
  }

  highlightLineTrack(v.line);
  drawer.style.display = 'block';
}

function startFollowCam(tripId) {
  state.followedVehicle = tripId;
  const vehicleRec = state.vehiclesMap.get(tripId);
  if (!vehicleRec) return;

  document.getElementById('cockpit-hud').style.display = 'block';
  document.getElementById('vehicle-drawer').style.display = 'none';

  updateCockpitCam(vehicleRec.data, vehicleRec.speed, vehicleRec.lastLat, vehicleRec.lastLng);
}

function exitFollowCam() {
  state.followedVehicle = null;
  const hud = document.getElementById('cockpit-hud');
  if (hud) hud.style.display = 'none';
  if (state.highlightedRouteLayer) {
    state.map.removeLayer(state.highlightedRouteLayer);
    state.highlightedRouteLayer = null;
  }
}

function updateCockpitCam(v, speed, lat, lng) {
  state.map.panTo([lat || v.lat, lng || v.lng], { animate: true, duration: 1.2 });
  
  const badge = document.getElementById('cockpit-badge');
  if (badge) {
    badge.textContent = v.line;
    badge.style.background = v.lineColor || '#00f0ff';
    badge.style.color = v.lineTextColor || '#fff';
  }

  const dirEl = document.getElementById('cockpit-direction');
  if (dirEl) dirEl.textContent = v.direction;
  const spdEl = document.getElementById('cockpit-speed');
  if (spdEl) spdEl.textContent = `${speed} km/h`;
  const nextEl = document.getElementById('cockpit-next-stop');
  if (nextEl) nextEl.textContent = v.nextStop?.name || 'In Fahrt';

  const delay = v.nextStop?.delayMinutes || 0;
  const delayEl = document.getElementById('cockpit-delay');
  if (delayEl) delayEl.textContent = delay <= 0 ? 'Pünktlich' : `+${delay} Min.`;
}

function highlightLineTrack(target) {
  if (!state.map || !target) return;

  if (state.highlightedRouteLayer) {
    state.map.removeLayer(state.highlightedRouteLayer);
    state.highlightedRouteLayer = null;
  }

  let lineTrack = typeof target === 'object' ? target : state.lineTracks.find(t => String(t.line) === String(target));
  if (!lineTrack) return;

  const trackGroup = L.featureGroup();
  const trackColor = lineTrack.color || '#00f0ff';

  const coords = lineTrack.coordinates && lineTrack.coordinates.length > 1
    ? lineTrack.coordinates
    : (lineTrack.stops || []).map(s => [s.lat, s.lng]);

  if (coords.length < 2) return;

  const aura = L.polyline(coords, {
    color: trackColor,
    weight: 10,
    opacity: 0.35,
    lineCap: 'round',
    lineJoin: 'round'
  });
  trackGroup.addLayer(aura);

  const core = L.polyline(coords, {
    color: trackColor,
    weight: 4,
    opacity: 0.95,
    lineCap: 'round',
    lineJoin: 'round'
  });
  trackGroup.addLayer(core);

  state.highlightedRouteLayer = trackGroup.addTo(state.map);
  state.map.fitBounds(core.getBounds(), { padding: [50, 50], maxZoom: 16 });
}

function plotRouteTrackOnMap({ fromName, toName, coordinates, lineColor, startPoint, endPoint, lineName }) {
  if (!state.map || !coordinates || coordinates.length < 2) return;

  if (state.aiRouteLayer) {
    state.map.removeLayer(state.aiRouteLayer);
    state.aiRouteLayer = null;
  }
  if (state.aiStartMarker) {
    state.map.removeLayer(state.aiStartMarker);
    state.aiStartMarker = null;
  }
  if (state.aiEndMarker) {
    state.map.removeLayer(state.aiEndMarker);
    state.aiEndMarker = null;
  }

  switchTab('map');

  const color = lineColor || '#10B981';
  const group = L.featureGroup();

  const aura = L.polyline(coordinates, {
    color: color,
    weight: 12,
    opacity: 0.35,
    lineCap: 'round',
    lineJoin: 'round'
  });
  group.addLayer(aura);

  const core = L.polyline(coordinates, {
    color: color,
    weight: 4.5,
    opacity: 0.95,
    lineCap: 'round',
    lineJoin: 'round'
  });
  group.addLayer(core);

  state.aiRouteLayer = group.addTo(state.map);

  const startCoord = startPoint || coordinates[0];
  state.aiStartMarker = L.circleMarker(startCoord, {
    radius: 7,
    color: '#fff',
    fillColor: '#10b981',
    fillOpacity: 1,
    weight: 2
  }).addTo(state.map).bindPopup(`<b>Start:</b> ${escapeHtml(fromName || 'Start')}`);

  const endCoord = endPoint || coordinates[coordinates.length - 1];
  state.aiEndMarker = L.circleMarker(endCoord, {
    radius: 7,
    color: '#fff',
    fillColor: '#00f0ff',
    fillOpacity: 1,
    weight: 2
  }).addTo(state.map).bindPopup(`<b>Ziel:</b> ${escapeHtml(toName || 'Ziel')}${lineName ? `<br>${escapeHtml(lineName)}` : ''}`);

  state.map.fitBounds(core.getBounds(), { padding: [80, 80], maxZoom: 16 });
}
window.plotRouteTrackOnMap = plotRouteTrackOnMap;

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function deg2rad(deg) { return deg * (Math.PI / 180); }

// ==========================================================================
// 9. Blaulicht & Einsatzradar
// ==========================================================================
async function loadEmergencies() {
  try {
    const res = await fetch('/api/emergencies');
    if (!res.ok) throw new Error('Emergencies HTTP ' + res.status);
    const data = await res.json();
    state.emergencies = data.emergencies || [];

    const headerEm = document.getElementById('header-emergency-val');
    if (headerEm) headerEm.textContent = state.emergencies.length;
    const hudEm = document.getElementById('hud-emergency-count');
    if (hudEm) hudEm.textContent = state.emergencies.length;

    renderEmergencyMarkers();
    renderEmergenciesList();
  } catch (err) {
    console.error('Error loading emergencies:', err.message);
  }
}

function renderEmergencyMarkers() {
  if (!state.emergencyMarkersGroup) return;
  state.emergencyMarkersGroup.clearLayers();

  state.emergencies.forEach(em => {
    if (!em.lat || !em.lng) return;

    const sirenHtml = `
      <div class="emergency-siren-marker" title="${escapeHtml(em.title)}">
        <div class="siren-ripple"></div>
        <div class="siren-core">
          <svg class="v-icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
        </div>
      </div>
    `;

    const icon = L.divIcon({
      className: 'emergency-div-icon',
      html: sirenHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([em.lat, em.lng], { icon, pane: 'emergenciesPane', zIndexOffset: 900 });
    marker.on('click', () => openEmergencyModal(em));
    state.emergencyMarkersGroup.addLayer(marker);
  });
}

function renderEmergenciesList() {
  const container = document.getElementById('emergencies-list');
  if (!container) return;

  const filtered = state.emergencies.filter(em => {
    if (state.activeEmergencyFilter === 'all') return true;
    if (state.activeEmergencyFilter === 'critical') return em.isCritical || em.category === 'critical';
    return em.category === state.activeEmergencyFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="glass-panel text-center py-6 text-muted">Keine Einsätze in dieser Kategorie gefunden.</div>`;
    return;
  }

  container.innerHTML = filtered.map(em => `
    <div class="glass-panel p-4" style="cursor:pointer;" onclick="window.appOpenEmergency('${em.id}')">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="dock-badge-alert">${em.category === 'fire' ? 'Feuerwehr' : 'Polizei Köln'}</span>
        <span class="text-muted mono" style="font-size:0.75rem;">${em.timeAgo || 'heute'}</span>
      </div>
      <h4 class="mt-2" style="font-weight:700; font-size:0.95rem;">${escapeHtml(em.title)}</h4>
      <div class="mt-4" style="display:flex; justify-content:space-between; align-items:center;">
        <span class="text-muted" style="font-size:0.75rem;">Veedel: <b style="color:var(--text-primary);">${em.district || 'Köln'}</b></span>
        <span class="action-btn secondary small" style="padding:0.25rem 0.6rem; font-size:0.75rem;">Details ➔</span>
      </div>
    </div>
  `).join('');
}

function initEmergenciesView() {
  document.querySelectorAll('[data-em-cat]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-em-cat]').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      state.activeEmergencyFilter = e.currentTarget.getAttribute('data-em-cat');
      renderEmergenciesList();
    });
  });

  const closeBtn = document.getElementById('close-em-modal-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('emergency-modal').style.display = 'none';
    });
  }
}

function openEmergencyModal(em) {
  const modal = document.getElementById('emergency-modal');
  if (!modal) return;

  document.getElementById('em-modal-title').textContent = em.title;
  document.getElementById('em-modal-meta').textContent = `${em.source} • ${em.district} • ${em.timeAgo || ''}`;
  document.getElementById('em-modal-desc').textContent = em.description || 'Keine weitere Beschreibung.';
  
  const linkBtn = document.getElementById('em-modal-link');
  if (linkBtn) linkBtn.href = em.link || '#';

  const mapBtn = document.getElementById('em-modal-map-btn');
  if (mapBtn) {
    mapBtn.onclick = () => {
      modal.style.display = 'none';
      switchTab('map');
      state.map.flyTo([em.lat, em.lng], 15);
    };
  }

  modal.style.display = 'flex';
}
window.appOpenEmergency = function(id) {
  const em = state.emergencies.find(e => e.id === id);
  if (em) openEmergencyModal(em);
};

// ==========================================================================
// 10. KVB-Rad & Nextbike
// ==========================================================================
async function loadBikes() {
  try {
    const res = await fetch('/api/bikes');
    if (!res.ok) throw new Error('Bikes HTTP ' + res.status);
    state.bikesData = await res.json();

    const avail = state.bikesData.totalAvailableBikes || 0;
    const stats = state.bikesData.totalStations || 0;

    const availEl = document.getElementById('bikes-total-available');
    if (availEl) availEl.textContent = avail.toLocaleString('de-DE');
    const statsEl = document.getElementById('bikes-total-stations');
    if (statsEl) statsEl.textContent = stats.toLocaleString('de-DE');
    const hudBikes = document.getElementById('hud-bikes-count');
    if (hudBikes) hudBikes.textContent = avail.toLocaleString('de-DE');

    renderBikeMarkers();
    renderBikesList();
  } catch (err) {
    console.error('Error loading bikes:', err.message);
  }
}

function renderBikeMarkers() {
  if (!state.bikeMarkersGroup || !state.bikesData) return;
  state.bikeMarkersGroup.clearLayers();

  const stations = state.bikesData.stations || [];
  stations.forEach(s => {
    const isZero = s.availableBikes === 0;
    const badgeHtml = `
      <div style="background:${isZero ? '#475569' : '#10B981'}; color:#000; font-weight:800; font-size:0.65rem; padding:2px 6px; border-radius:999px; border:1px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.4);">
        🚲 ${s.availableBikes}
      </div>
    `;

    const icon = L.divIcon({
      className: 'bike-div-icon',
      html: badgeHtml,
      iconSize: [36, 18],
      iconAnchor: [18, 9]
    });

    const marker = L.marker([s.lat, s.lng], { icon, zIndexOffset: 300 });
    marker.bindPopup(`<b>${escapeHtml(s.name)}</b><br>Freie Räder: <b>${s.availableBikes}</b><br>Stellplätze: <b>${s.freeRacks}</b>`);
    state.bikeMarkersGroup.addLayer(marker);
  });
}

function renderBikesList() {
  const container = document.getElementById('bikes-stations-grid');
  if (!container || !state.bikesData) return;

  const stations = state.bikesData.stations || [];
  container.innerHTML = stations.slice(0, 60).map(s => `
    <div class="glass-panel p-3" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="window.appFlyToBike(${s.lat}, ${s.lng})">
      <div>
        <h4 style="font-weight:700; font-size:0.85rem;">${escapeHtml(s.name)}</h4>
        <span class="text-muted" style="font-size:0.75rem;">Freie Plätze: ${s.freeRacks}/${s.bikeRacks}</span>
      </div>
      <span class="dock-badge-alert" style="background:${s.availableBikes > 0 ? 'var(--vexto-emerald)' : '#475569'}; color:#000; font-size:0.75rem;">
        ${s.availableBikes} Räder
      </span>
    </div>
  `).join('');
}

function initBikesView() {
  const showOnMapBtn = document.getElementById('show-bikes-on-map-btn');
  if (showOnMapBtn) {
    showOnMapBtn.addEventListener('click', () => {
      switchTab('map');
      state.filters.bikes = true;
      const chk = document.getElementById('chk-bikes');
      if (chk) chk.checked = true;
      if (state.bikeMarkersGroup) state.map.addLayer(state.bikeMarkersGroup);
    });
  }
}
window.appFlyToBike = function(lat, lng) {
  switchTab('map');
  state.filters.bikes = true;
  const chk = document.getElementById('chk-bikes');
  if (chk) chk.checked = true;
  if (state.bikeMarkersGroup) state.map.addLayer(state.bikeMarkersGroup);
  state.map.flyTo([lat, lng], 16);
};

// ==========================================================================
// 11. Analytics & SQLite Persistence
// ==========================================================================
async function loadAnalytics() {
  try {
    const res = await fetch('/api/analytics');
    if (!res.ok) throw new Error('Analytics HTTP ' + res.status);
    state.analytics = await res.json();

    const score = state.analytics.punctualityScore || 94.2;
    const headerPunct = document.getElementById('header-punctuality-val');
    if (headerPunct) headerPunct.textContent = `${score}%`;
    const scoreVal = document.getElementById('an-score-val');
    if (scoreVal) scoreVal.textContent = `${score}%`;
    const trackedVal = document.getElementById('an-total-tracked');
    if (trackedVal) trackedVal.textContent = state.analytics.totalTracked || 300;
    const avgDelay = document.getElementById('an-avg-delay');
    if (avgDelay) avgDelay.textContent = `${state.analytics.averageDelayMinutes || 0.8} Min`;

    renderAnalyticsLines();
  } catch (err) {
    console.error('Error loading analytics:', err.message);
  }
}

function renderAnalyticsLines() {
  const tbody = document.getElementById('analytics-lines-tbody');
  if (!tbody || !state.analytics) return;

  const lines = state.analytics.linePerformance || [];
  if (lines.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-muted">Keine Linien-Daten verfügbar</td></tr>`;
    return;
  }

  tbody.innerHTML = lines.map(l => {
    const isPunctual = l.punctuality >= 90;
    return `
      <tr>
        <td>
          <span class="line-badge" style="background:#00f0ff; color:#05070a;">${l.line}</span>
        </td>
        <td class="mono">${l.activeVehicles} Bahnen</td>
        <td class="mono" style="font-weight:700; color:${isPunctual ? 'var(--vexto-emerald)' : 'var(--vexto-amber)'};">
          ${l.punctuality}%
        </td>
        <td class="mono">${l.averageDelay} Min</td>
        <td>
          <span class="telem-dot ${isPunctual ? 'pulse-emerald' : 'pulse-rose'}" style="display:inline-block; margin-right:4px;"></span>
          ${isPunctual ? 'Pünktlich' : 'Verzögert'}
        </td>
      </tr>
    `;
  }).join('');
}

async function loadSavedRoutes() {
  try {
    const res = await fetch('/api/saved-routes');
    if (!res.ok) return;
    const data = await res.json();
    state.savedRoutes = data.routes || [];
    renderSavedRoutes();
  } catch (e) {
    console.warn('Saved routes error:', e.message);
  }
}

function renderSavedRoutes() {
  const list = document.getElementById('saved-commutes-list');
  if (!list) return;

  if (state.savedRoutes.length === 0) {
    list.innerHTML = `
      <div class="glass-panel p-3" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <b>Florastr. ➔ Neumarkt</b>
          <div class="text-muted" style="font-size:0.75rem;">Standard-Pendlerroute (Linien 12 & 15)</div>
        </div>
        <button class="action-btn primary small" onclick="window.appPlanSavedRoute('Köln Florastr.', 'Köln Neumarkt')">
          Route planen ➔
        </button>
      </div>
    `;
    return;
  }

  list.innerHTML = state.savedRoutes.map(r => `
    <div class="glass-panel p-3" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
      <div>
        <b>${escapeHtml(r.name || `${r.from_name} ➔ ${r.to_name}`)}</b>
        <div class="text-muted" style="font-size:0.75rem;">${escapeHtml(r.from_name)} nach ${escapeHtml(r.to_name)}</div>
      </div>
      <button class="action-btn primary small" onclick="window.appPlanSavedRoute('${r.from_name}', '${r.to_name}')">
        Route planen ➔
      </button>
    </div>
  `).join('');
}

function initAnalyticsView() {
  const addBtn = document.getElementById('add-commute-btn');
  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      const fromName = prompt('Start-Haltestelle:', 'Köln Florastr.');
      if (!fromName) return;
      const toName = prompt('Ziel-Haltestelle:', 'Köln Dom/Hbf');
      if (!toName) return;

      try {
        await fetch('/api/saved-routes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromName, fromId: '', toName, toId: '', name: `${fromName} ➔ ${toName}` })
        });
        loadSavedRoutes();
      } catch (e) {
        alert('Fehler: ' + e.message);
      }
    });
  }
}
window.appPlanSavedRoute = function(from, to) {
  switchTab('routes');
  const fromInput = document.getElementById('route-from-input');
  const toInput = document.getElementById('route-to-input');
  if (fromInput) fromInput.value = from;
  if (toInput) toInput.value = to;
  const calcBtn = document.getElementById('calculate-route-btn');
  if (calcBtn) calcBtn.click();
};

// ==========================================================================
// 12. Station Tracks & Verified Station Pins
// ==========================================================================
async function loadLineTracksAndStations() {
  try {
    const res = await fetch('/api/lines');
    if (!res.ok) throw new Error('Lines HTTP ' + res.status);
    const data = await res.json();
    state.lineTracks = data.lines || [];
    state.verifiedStations = data.stations || [];

    renderLineTracks();
    renderStationMarkers();
  } catch (err) {
    console.error('Error loading lines:', err.message);
  }
}

function renderLineTracks() {
  if (!state.tracksBahnGroup || !state.tracksBusGroup) return;
  state.tracksBahnGroup.clearLayers();
  state.tracksBusGroup.clearLayers();

  state.lineTracks.forEach(track => {
    const isBus = track.mode === 'bus' || track.routeType === 'bus';
    const targetGroup = isBus ? state.tracksBusGroup : state.tracksBahnGroup;
    const trackColor = track.color || (isBus ? '#D92534' : '#00f0ff');

    if (track.segments && track.segments.length > 0) {
      track.segments.forEach(seg => {
        if (!seg.coords || seg.coords.length < 2) return;

        if (seg.isTunnel) {
          // Underground Subway Tunnel Glowing Tube
          const tunnelAura = L.polyline(seg.coords, {
            pane: 'tracksPane',
            color: trackColor,
            weight: 7,
            opacity: 0.35,
            lineCap: 'round',
            lineJoin: 'round'
          });
          const tunnelCore = L.polyline(seg.coords, {
            pane: 'tracksPane',
            color: trackColor,
            weight: 3.5,
            opacity: 0.95,
            dashArray: '5, 7',
            lineCap: 'round',
            lineJoin: 'round'
          });

          tunnelCore.bindTooltip(`<b>🚇 ${track.name} (U-Bahn Tunnel)</b><br><small style="color:#94a3b8;">${track.stops?.length || 0} Stationen • Klick für Strecken-Inspektor</small>`, { sticky: true });
          tunnelCore.on('click', () => openLineInspector(track));
          tunnelAura.on('click', () => openLineInspector(track));

          targetGroup.addLayer(tunnelAura);
          targetGroup.addLayer(tunnelCore);
        } else if (isBus) {
          // Bus Corridor Styling
          const busLine = L.polyline(seg.coords, {
            pane: 'tracksPane',
            color: trackColor,
            weight: 2.8,
            opacity: 0.85,
            dashArray: '6, 6',
            lineCap: 'round',
            lineJoin: 'round'
          });
          busLine.bindTooltip(`<b>🚌 ${track.name}</b><br><small style="color:#94a3b8;">${track.stops?.length || 0} Haltestellen • Klick für Strecken-Inspektor</small>`, { sticky: true });
          busLine.on('click', () => openLineInspector(track));
          targetGroup.addLayer(busLine);
        } else {
          // Surface Railway Track
          const surfaceLine = L.polyline(seg.coords, {
            pane: 'tracksPane',
            color: trackColor,
            weight: 3.8,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round'
          });
          surfaceLine.bindTooltip(`<b>🚇 ${track.name} (Oberirdisch)</b><br><small style="color:#94a3b8;">${track.stops?.length || 0} Stationen • Klick für Strecken-Inspektor</small>`, { sticky: true });
          surfaceLine.on('click', () => openLineInspector(track));
          targetGroup.addLayer(surfaceLine);
        }
      });
    } else if (track.coordinates && track.coordinates.length > 1) {
      const polyline = L.polyline(track.coordinates, {
        pane: 'tracksPane',
        color: trackColor,
        weight: isBus ? 2.8 : 3.8,
        opacity: 0.85,
        dashArray: isBus ? '6, 6' : null,
        lineJoin: 'round'
      });
      polyline.bindTooltip(`<b>${isBus ? '🚌' : '🚇'} ${track.name}</b><br><small style="color:#94a3b8;">Klick für Strecken-Inspektor</small>`, { sticky: true });
      polyline.on('click', () => openLineInspector(track));
      targetGroup.addLayer(polyline);
    }
  });
}

async function openLineInspector(target) {
  if (!target) return;
  let track = typeof target === 'object' ? target : null;
  if (!track) {
    if (!state.lineTracks || state.lineTracks.length === 0) {
      try {
        const res = await fetch('/api/lines');
        const data = await res.json();
        state.lineTracks = data.lines || [];
        state.verifiedStations = data.verifiedStations || [];
      } catch (e) {}
    }
    if (target === 'bus') {
      track = state.lineTracks.find(t => t.mode === 'bus') || state.lineTracks[0];
    } else {
      track = state.lineTracks.find(t => String(t.line) === String(target)) || state.lineTracks.find(t => t.line == target);
    }
  }
  if (!track) {
    track = { line: target, name: `Linie ${target}`, mode: 'stadtbahn', stops: [], coordinates: [] };
  }
  
  const drawer = document.getElementById('line-inspector-drawer');
  if (!drawer) return;

  const isBus = track.mode === 'bus';
  const badge = document.getElementById('insp-line-badge');
  if (badge) {
    badge.textContent = track.line;
    badge.style.background = track.color || (isBus ? '#D92534' : '#00f0ff');
    badge.style.color = track.textColor || '#fff';
  }

  const titleEl = document.getElementById('insp-line-title');
  if (titleEl) titleEl.textContent = track.name || (isBus ? `Bus ${track.line}` : `Stadtbahn Linie ${track.line}`);

  const stops = track.stops || [];
  const startStop = stops[0]?.short || stops[0]?.name || 'Start';
  const endStop = stops[stops.length - 1]?.short || stops[stops.length - 1]?.name || 'Ziel';
  
  const terminiEl = document.getElementById('insp-line-termini');
  if (terminiEl) terminiEl.textContent = `${startStop} ➔ ${endStop}`;

  // Count active vehicles on this line
  let activeVehiclesCount = 0;
  for (const record of state.vehiclesMap.values()) {
    const v = record.data;
    if (!v) continue;
    const cleanLine = String(v.line || '').replace(/^(LINIE|STADTBAHN|STRASSENBAHN|BUS|SB)\s*/i, '').trim();
    if (cleanLine === String(track.line)) {
      activeVehiclesCount++;
    }
  }

  const activeVehiclesEl = document.getElementById('insp-active-vehicles');
  if (activeVehiclesEl) activeVehiclesEl.textContent = isBus ? `${activeVehiclesCount} Busse` : `${activeVehiclesCount} Bahnen`;

  const stationCountEl = document.getElementById('insp-station-count');
  if (stationCountEl) stationCountEl.textContent = stops.length;

  const tunnelCount = stops.filter(s => s.isUnderground).length;
  const tunnelCountEl = document.getElementById('insp-tunnel-count');
  if (tunnelCountEl) tunnelCountEl.textContent = isBus ? '0 (Straße)' : `${tunnelCount} U-Bahn`;

  // Render Timeline
  const timelineContainer = document.getElementById('insp-timeline-list');
  if (timelineContainer) {
    timelineContainer.innerHTML = stops.map((s, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === stops.length - 1;
      const isTunnel = s.isUnderground;

      return `
        <div class="timeline-station-item" data-station-id="${escapeHtml(s.id || '')}" data-lat="${s.lat}" data-lng="${s.lng}">
          <div class="timeline-node-col">
            <div class="timeline-dot ${isTunnel ? 'tunnel-dot' : 'surface-dot'} ${isFirst || isLast ? 'terminus-dot' : ''}"></div>
            ${!isLast ? '<div class="timeline-line"></div>' : ''}
          </div>
          <div class="timeline-info-col">
            <div class="timeline-station-name">${escapeHtml(s.name || s.short || 'Station')}</div>
            <div class="timeline-badges">
              <span class="tstation-tag ${isTunnel ? 'tunnel' : 'surface'}">${isTunnel ? '🚇 U-Bahn' : '☀️ Oberirdisch'}</span>
              ${isFirst ? '<span class="tstation-tag terminus">Start</span>' : ''}
              ${isLast ? '<span class="tstation-tag terminus">Endstation</span>' : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Station click events
    timelineContainer.querySelectorAll('.timeline-station-item').forEach(item => {
      item.addEventListener('click', () => {
        const lat = parseFloat(item.getAttribute('data-lat'));
        const lng = parseFloat(item.getAttribute('data-lng'));
        const stId = item.getAttribute('data-station-id');
        if (lat && lng && state.map) {
          state.map.setView([lat, lng], 16, { animate: true });
        }
        const st = state.verifiedStations.find(s => s.id === stId);
        if (st) openStationDrawer(st);
      });
    });
  }

  // Highlight line on map
  highlightLineTrack(track);

  // Focus Button
  const focusBtn = document.getElementById('insp-focus-line-btn');
  if (focusBtn) {
    focusBtn.onclick = () => highlightLineTrack(track);
  }

  drawer.style.display = 'flex';
}

function closeLineInspector() {
  const drawer = document.getElementById('line-inspector-drawer');
  if (drawer) drawer.style.display = 'none';
  if (state.highlightedRouteLayer) {
    state.map.removeLayer(state.highlightedRouteLayer);
    state.highlightedRouteLayer = null;
  }
}

function initLineInspector() {
  const closeBtn = document.getElementById('insp-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeLineInspector();
      document.querySelectorAll('.tline-pill').forEach(p => p.classList.remove('active'));
      state.selectedLineFilter = 'all';
      applyVehicleVisibility();
    });
  }
}

function renderStationMarkers() {
  if (!state.stationMarkersGroup) return;
  state.stationMarkersGroup.clearLayers();

  state.verifiedStations.forEach(st => {
    const isUnderground = st.isUnderground || false;
    const uIcon = L.divIcon({
      className: 'station-div-icon',
      html: `<div style="background:${isUnderground ? '#0284c7' : 'var(--bg-surface-elevated)'}; color:#fff; font-weight:800; font-size:0.65rem; width:18px; height:18px; border-radius:4px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.4);">${isUnderground ? 'U' : 'H'}</div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    const marker = L.marker([st.lat, st.lng], {
      icon: uIcon,
      pane: 'stationsPane',
      zIndexOffset: 700
    });

    marker.bindTooltip(`<b>${escapeHtml(st.name)}</b><br><small style="color:#94a3b8;">Linien: ${(st.lines || []).join(', ')}</small>`, {
      direction: 'top',
      offset: [0, -10]
    });

    marker.on('click', (e) => {
      if (e && e.originalEvent) L.DomEvent.stopPropagation(e);
      openStationDrawer(st);
    });

    state.stationMarkersGroup.addLayer(marker);
  });
}

// ==========================================================================
// 13. TomTom Live Traffic (Flow & Incident Markers)
// ==========================================================================
async function loadTomTomTraffic() {
  if (!state.map) return;

  try {
    const cfgRes = await fetch('/api/traffic/config');
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      if (cfg.flowTileUrl) {
        if (state.trafficFlowLayer) {
          state.map.removeLayer(state.trafficFlowLayer);
        }
        state.trafficFlowLayer = L.tileLayer(cfg.flowTileUrl, {
          maxZoom: 18,
          opacity: 0.85,
          zIndex: 400,
          attribution: cfg.attribution || '&copy; TomTom Traffic'
        });
        if (state.filters.traffic) {
          state.trafficFlowLayer.addTo(state.map);
        }
      }
    }
  } catch (err) {
    console.warn('TomTom traffic tile config error:', err.message);
  }

  // Load Incident Points (Traffic Jams & Road Closures)
  try {
    const incRes = await fetch('/api/traffic/incidents');
    if (incRes.ok) {
      const data = await incRes.json();
      const incidents = data.incidents || [];
      renderTomTomIncidents(incidents);
    }
  } catch (err) {
    console.warn('TomTom incidents error:', err.message);
  }
}

function renderTomTomIncidents(incidents) {
  if (!state.trafficIncidentsGroup) return;
  state.trafficIncidentsGroup.clearLayers();

  incidents.forEach(inc => {
    if (!inc.lat || !inc.lng) return;

    const isJam = inc.category === 'jam' || inc.type === 'Jam';
    const delayMins = inc.delaySeconds ? Math.round(inc.delaySeconds / 60) : 0;
    const badgeText = delayMins > 0 ? `+${delayMins}m` : (isJam ? 'Stau' : 'Baustelle');
    const colorBg = isJam ? '#f43f5e' : '#f59e0b';
    const iconSymbol = isJam ? '⚠️' : '🚧';

    const iconHtml = `
      <div class="traffic-pin-marker" style="display:flex; align-items:center; gap:3px; background:rgba(10,13,20,0.85); border:1px solid ${colorBg}; border-radius:12px; padding:2px 6px; box-shadow:0 0 10px ${colorBg}44; color:#fff; font-size:11px; font-weight:700; cursor:pointer; pointer-events:auto;">
        <span>${iconSymbol}</span>
        <span style="color:${colorBg};">${escapeHtml(inc.roadNumber || 'Köln')}</span>
        ${delayMins > 0 ? `<span style="background:${colorBg}; color:#05070a; border-radius:4px; padding:0 3px; font-size:9px;">${badgeText}</span>` : ''}
      </div>
    `;

    const customIcon = L.divIcon({
      html: iconHtml,
      className: 'vexto-traffic-marker-wrap',
      iconSize: [80, 24],
      iconAnchor: [40, 12]
    });

    const marker = L.marker([inc.lat, inc.lng], { icon: customIcon });
    
    const popupContent = `
      <div style="font-family:var(--font-sans, sans-serif); min-width:200px; padding:4px;">
        <div style="font-weight:800; font-size:13px; color:${colorBg}; margin-bottom:4px;">
          ${iconSymbol} ${escapeHtml(inc.roadNumber || 'Verkehrsmeldung')}
        </div>
        <div style="font-size:12px; line-height:1.4; color:#e2e8f0; margin-bottom:6px;">
          ${escapeHtml(inc.description || 'Verkehrsbehinderung')}
        </div>
        ${inc.from ? `<div style="font-size:11px; color:#94a3b8;">Von: ${escapeHtml(inc.from)}</div>` : ''}
        ${inc.to ? `<div style="font-size:11px; color:#94a3b8;">Nach: ${escapeHtml(inc.to)}</div>` : ''}
        ${delayMins > 0 ? `<div style="font-size:11px; font-weight:700; color:#f43f5e; margin-top:4px;">Verzögerung: ca. +${delayMins} Min.</div>` : ''}
      </div>
    `;

    marker.bindPopup(popupContent, { className: 'vexto-map-popup' });
    state.trafficIncidentsGroup.addLayer(marker);
  });
}

// ==========================================================================
// 14. Station Drawer & Departures (Tab 2)
// ==========================================================================
function openStationDrawer(station) {
  state.activeStation = station;
  const drawer = document.getElementById('station-drawer');
  if (!drawer) return;

  document.getElementById('drawer-station-name').textContent = station.name;
  const linesContainer = document.getElementById('drawer-station-lines');
  linesContainer.innerHTML = (station.lines || []).map(line => `
    <span class="line-badge" style="background:#00f0ff; color:#05070a;">${line}</span>
  `).join('');

  updateDrawerFavIcon();
  drawer.style.display = 'block';
  drawer.classList.add('open');
  fetchDrawerDepartures(station.id);
}
window.openStationDrawer = openStationDrawer;

function closeStationDrawer() {
  const drawer = document.getElementById('station-drawer');
  if (drawer) {
    drawer.style.display = 'none';
    drawer.classList.remove('open');
  }
}
window.closeStationDrawer = closeStationDrawer;

function updateDrawerFavIcon() {
  const btn = document.getElementById('drawer-fav-btn');
  if (!btn) return;
  const isFav = state.favorites.some(f => f.id === state.activeStation.id);
  btn.innerHTML = isFav ? getIcon('star', 'sm text-amber') : getIcon('starOutline', 'sm');
}

async function fetchDrawerDepartures(stopId) {
  const listEl = document.getElementById('drawer-departures-list');
  if (!listEl) return;
  listEl.innerHTML = `
    <div class="py-4 text-center">
      <div class="spinner"></div>
      <div class="mt-2 text-muted">Lade Live-Abfahrten...</div>
    </div>
  `;

  try {
    const res = await fetch(`/api/departures?stopId=${encodeURIComponent(stopId)}`);
    if (!res.ok) throw new Error('Departures HTTP ' + res.status);
    const data = await res.json();
    state.departures = data.departures || [];
    renderDrawerDepartures();
  } catch (err) {
    listEl.innerHTML = `<div class="text-rose py-4 text-center">Fehler: ${escapeHtml(err.message)}</div>`;
  }
}

function renderDrawerDepartures() {
  const listEl = document.getElementById('drawer-departures-list');
  if (!listEl) return;

  const filtered = state.departures.filter(dep => {
    if (state.drawerDepFilter === 'all') return true;
    if (state.drawerDepFilter === 'stadtbahn') return dep.product === 'stadtbahn';
    if (state.drawerDepFilter === 's-bahn') return dep.product === 'nationalExpress' || dep.product === 'regional' || dep.product === 'sbahn';
    if (state.drawerDepFilter === 'bus') return dep.product === 'bus';
    return true;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="text-muted py-6 text-center">Keine weiteren Abfahrten in Kürze.</div>`;
    return;
  }

  listEl.innerHTML = filtered.slice(0, 15).map(dep => {
    const isDelayed = dep.delayMinutes > 0;
    const dest = dep.destination || dep.direction || 'Köln';
    const pTime = dep.plannedTime || (dep.plannedWhen ? new Date(dep.plannedWhen).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '--:--');
    const tMin = dep.timeMinutes || (dep.minutesUntil !== undefined ? (dep.minutesUntil === 0 ? 'Jetzt' : `in ${dep.minutesUntil} Min.`) : pTime);

    return `
      <div class="glass-panel p-3 mb-2" style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <span class="line-badge" style="background:${dep.lineColor || '#00f0ff'}; color:${dep.lineTextColor || '#05070a'};">
            ${dep.line}
          </span>
          <div>
            <div style="font-weight:700; font-size:0.85rem;">${escapeHtml(dest)}</div>
            <div class="text-muted" style="font-size:0.75rem;">${dep.platform ? `Gl. ${dep.platform} • ` : ''}${pTime}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div class="mono" style="font-weight:800; font-size:0.9rem; color:var(--text-primary);">${tMin}</div>
          <div class="mono" style="font-size:0.75rem; font-weight:700; color:${isDelayed ? 'var(--vexto-rose)' : 'var(--vexto-emerald)'};">
            ${isDelayed ? `+${dep.delayMinutes} Min` : 'pünktlich'}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function initDeparturesView() {
  renderFavoritesList();
  
  const stationInput = document.getElementById('station-input');
  if (stationInput) {
    setupAutocomplete(stationInput, document.getElementById('station-autocomplete'), (station) => {
      state.activeStation = station;
      updateActiveStationHeader();
      fetchDepartures(station.id);
    });
  }

  const manRefreshBtn = document.getElementById('manual-refresh-btn');
  if (manRefreshBtn) {
    manRefreshBtn.addEventListener('click', () => {
      fetchDepartures(state.activeStation.id);
    });
  }

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      state.depFilter = e.currentTarget.getAttribute('data-filter');
      renderDeparturesTable();
    });
  });
}

function updateActiveStationHeader() {
  const nameEl = document.getElementById('active-station-name');
  if (nameEl) nameEl.textContent = state.activeStation.name;
  const linesRow = document.getElementById('active-station-lines');
  if (linesRow) {
    linesRow.innerHTML = (state.activeStation.lines || []).map(l => `
      <span class="line-badge" style="background:#00f0ff; color:#05070a;">${l}</span>
    `).join('');
  }
}

async function fetchDepartures(stopId) {
  const tbody = document.getElementById('departures-tbody');
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td colspan="4" class="text-center py-6">
        <div class="spinner"></div>
        <div class="mt-2 text-muted">Lade Live-Abfahrten für ${escapeHtml(state.activeStation.name)}...</div>
      </td>
    </tr>
  `;

  try {
    const res = await fetch(`/api/departures?stopId=${encodeURIComponent(stopId)}`);
    if (!res.ok) throw new Error('Departures HTTP ' + res.status);
    const data = await res.json();
    state.departures = data.departures || [];
    renderDeparturesTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-rose py-4 text-center">Fehler: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderDeparturesTable() {
  const tbody = document.getElementById('departures-tbody');
  if (!tbody) return;

  const filtered = state.departures.filter(dep => {
    if (state.depFilter === 'all') return true;
    if (state.depFilter === 'stadtbahn') return dep.product === 'stadtbahn';
    if (state.depFilter === 's-bahn') return dep.product === 'nationalExpress' || dep.product === 'regional' || dep.product === 'sbahn';
    if (state.depFilter === 'bus') return dep.product === 'bus';
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-muted">Keine Abfahrten in den nächsten 60 Minuten.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(dep => {
    const isDelayed = dep.delayMinutes > 0;
    const dest = dep.destination || dep.direction || 'Köln';
    const pTime = dep.plannedTime || (dep.plannedWhen ? new Date(dep.plannedWhen).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '--:--');
    const tMin = dep.timeMinutes || (dep.minutesUntil !== undefined ? (dep.minutesUntil === 0 ? 'Jetzt' : `in ${dep.minutesUntil} Min.`) : pTime);

    return `
      <tr>
        <td>
          <span class="line-badge" style="background:${dep.lineColor || '#00f0ff'}; color:${dep.lineTextColor || '#05070a'};">
            ${dep.line}
          </span>
        </td>
        <td>
          <div style="font-weight:700;">${escapeHtml(dest)}</div>
          <small class="text-muted">Plan: ${pTime}</small>
        </td>
        <td class="mono">
          <span>${dep.platform ? `Gl. ${dep.platform}` : '-'}</span>
        </td>
        <td class="text-right">
          <div class="mono" style="font-weight:800; font-size:0.95rem;">${tMin}</div>
          <div class="mono" style="font-size:0.75rem; font-weight:700; color:${isDelayed ? 'var(--vexto-rose)' : 'var(--vexto-emerald)'};">
            ${isDelayed ? `+${dep.delayMinutes} Min.` : 'pünktlich'}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderFavoritesList() {
  const container = document.getElementById('favorites-list');
  if (!container) return;

  container.innerHTML = state.favorites.map(fav => `
    <button class="action-btn secondary small" onclick="window.appSelectFavorite('${fav.id}', '${escapeHtml(fav.name)}')">
      ${escapeHtml(fav.name)}
    </button>
  `).join('');
}
window.appSelectFavorite = function(id, name) {
  const verified = state.verifiedStations.find(s => s.id === id);
  state.activeStation = verified || { id, name, short: name, lines: [] };
  updateActiveStationHeader();
  fetchDepartures(id);
};

function toggleFavorite(station) {
  const index = state.favorites.findIndex(f => f.id === station.id);
  if (index >= 0) {
    state.favorites.splice(index, 1);
  } else {
    state.favorites.push({ id: station.id, name: station.short || station.name });
  }
  localStorage.setItem('koeln_favs', JSON.stringify(state.favorites));
  renderFavoritesList();
}

function initGlobalSearch() {
  const input = document.getElementById('global-station-search');
  const dropdown = document.getElementById('global-search-results');
  const clearBtn = document.getElementById('clear-search-btn');

  if (!input || !dropdown) return;

  setupAutocomplete(input, dropdown, (station) => {
    switchTab('map');
    openStationDrawer(station);
    state.map.flyTo([station.lat, station.lng], 16);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      dropdown.style.display = 'none';
    });
  }

  // Keyboard shortcut ⌘K / Ctrl+K
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      input.focus();
    }
  });
}

function setupAutocomplete(inputEl, dropdownEl, onSelect) {
  inputEl.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (query.length < 1) {
      dropdownEl.style.display = 'none';
      return;
    }

    const matches = state.verifiedStations.filter(s => 
      s.name.toLowerCase().includes(query) || (s.short && s.short.toLowerCase().includes(query))
    ).slice(0, 8);

    if (matches.length > 0) {
      dropdownEl.innerHTML = matches.map(s => `
        <div class="search-item" onclick="window.appAutocompleteSelect('${s.id}')">
          <div style="font-weight:700; font-size:0.85rem;">${escapeHtml(s.name)}</div>
          <div style="display:flex; gap:0.25rem;">
            ${(s.lines || []).slice(0, 3).map(l => `<span class="line-badge" style="background:#00f0ff; color:#05070a; font-size:0.65rem; padding:1px 4px;">${l}</span>`).join('')}
          </div>
        </div>
      `).join('');
      dropdownEl.style.display = 'block';
    } else {
      dropdownEl.style.display = 'none';
    }
  });

  window.appAutocompleteSelect = (id) => {
    const st = state.verifiedStations.find(s => s.id === id);
    if (st) {
      inputEl.value = st.name;
      dropdownEl.style.display = 'none';
      onSelect(st);
    }
  };

  document.addEventListener('click', (e) => {
    if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target)) {
      dropdownEl.style.display = 'none';
    }
  });
}

// ==========================================================================
// 15. Route Planner (Tab 5)
// ==========================================================================
function initRoutePlanner() {
  const fromInput = document.getElementById('route-from-input');
  const toInput = document.getElementById('route-to-input');
  const swapBtn = document.getElementById('swap-route-btn');
  const calcBtn = document.getElementById('calculate-route-btn');

  if (swapBtn) {
    swapBtn.addEventListener('click', () => {
      const temp = fromInput.value;
      fromInput.value = toInput.value;
      toInput.value = temp;
    });
  }

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      fromInput.value = e.currentTarget.getAttribute('data-from');
      toInput.value = e.currentTarget.getAttribute('data-to');
      calcBtn.click();
    });
  });

  if (calcBtn) {
    calcBtn.addEventListener('click', () => {
      const from = fromInput.value.trim();
      const to = toInput.value.trim();
      if (from && to) calculateRoute(from, to);
    });
  }
}

async function calculateRoute(from, to) {
  const container = document.getElementById('route-results-container');
  const listEl = document.getElementById('route-cards-list');
  container.style.display = 'block';

  listEl.innerHTML = `
    <div class="glass-panel text-center py-6">
      <div class="spinner"></div>
      <div class="mt-2 text-muted">Berechne Verbindung von "${escapeHtml(from)}" nach "${escapeHtml(to)}"...</div>
    </div>
  `;

  try {
    const res = await fetch(`/api/routes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!res.ok) throw new Error('Routes HTTP ' + res.status);
    const data = await res.json();
    const routes = data.routes || [];

    if (routes.length === 0) {
      listEl.innerHTML = `<div class="glass-panel text-center py-6 text-muted">Keine Verbindung gefunden.</div>`;
      return;
    }

    listEl.innerHTML = routes.map((r) => {
      const depTimeStr = r.departureTime || (r.departure ? new Date(r.departure).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '--:--');
      const arrTimeStr = r.arrivalTime || (r.arrival ? new Date(r.arrival).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '--:--');
      const routeEncoded = encodeURIComponent(JSON.stringify(r));

      return `
        <div class="glass-panel p-4 mb-3">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span class="mono" style="font-weight:800; font-size:1.1rem;">${depTimeStr} ➔ ${arrTimeStr}</span>
            </div>
            <span class="dock-badge-alert" style="background:var(--vexto-emerald); color:#000;">
              ${r.durationMinutes} Min.
            </span>
          </div>
          <div class="mt-3" style="display:flex; justify-content:flex-end;">
            <button class="action-btn primary small" onclick="window.appPlotCalculatedRoute('${escapeHtml(from)}', '${escapeHtml(to)}', '${routeEncoded}')">
              Trasse auf Karte zeichnen ➔
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<div class="glass-panel text-center py-6 text-rose">Fehler: ${escapeHtml(err.message)}</div>`;
  }
}

window.appPlotCalculatedRoute = function(fromName, toName, routeJsonStr) {
  try {
    const route = JSON.parse(decodeURIComponent(routeJsonStr));
    const transitLeg = route.legs?.find(l => !l.walking && l.line);
    const lineNum = transitLeg ? String(transitLeg.line) : null;
    const lineTrack = lineNum ? state.lineTracks.find(t => t.line === lineNum) : null;

    let coords = lineTrack?.coordinates || [];
    if (coords.length < 2) {
      const fromSt = state.verifiedStations.find(s => s.name.toLowerCase().includes(fromName.toLowerCase()));
      const toSt = state.verifiedStations.find(s => s.name.toLowerCase().includes(toName.toLowerCase()));
      if (fromSt && toSt) {
        coords = [[fromSt.lat, fromSt.lng], [toSt.lat, toSt.lng]];
      }
    }

    if (coords.length > 1) {
      plotRouteTrackOnMap({
        fromName,
        toName,
        coordinates: coords,
        lineColor: lineTrack?.color || '#00f0ff',
        lineName: lineNum ? `Linie ${lineNum}` : null
      });
    }
  } catch (err) {
    console.error('Error plotting route:', err);
  }
};

// ==========================================================================
// 16. Disruptions (Tab 6)
// ==========================================================================
function initDisruptionsView() {
  const closeBtn = document.getElementById('close-modal-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('disruption-modal').style.display = 'none';
    });
  }
}

async function loadDisruptions() {
  try {
    const res = await fetch('/api/disruptions');
    if (!res.ok) return;
    state.disruptions = await res.json();

    const summary = state.disruptions.summary || { severe: 0, warning: 0, normal: 0 };
    const totalIssues = (summary.severe || 0) + (summary.warning || 0);
    const badge = document.getElementById('disruption-badge');
    if (badge) {
      badge.textContent = totalIssues > 0 ? `${totalIssues} AKTIV` : 'NORMAL';
    }

    renderDisruptionsGrid();
  } catch (e) {
    console.warn('Disruptions load error:', e.message);
  }
}

function renderDisruptionsGrid() {
  const stadtbahnGrid = document.getElementById('stadtbahn-status-grid');
  if (!stadtbahnGrid || !state.disruptions) return;

  const lines = (state.disruptions.lines || []).filter(l => l.type === 'stadtbahn');
  stadtbahnGrid.innerHTML = lines.map(l => `
    <div class="glass-panel p-3" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="window.appOpenDisruption('${l.id}')">
      <span class="line-badge" style="background:#00f0ff; color:#05070a;">${l.id}</span>
      <span class="telem-dot ${l.status === 'green' ? 'pulse-emerald' : 'pulse-rose'}"></span>
    </div>
  `).join('');
}

window.appOpenDisruption = function(lineId) {
  const l = state.disruptions?.lines?.find(x => x.id === lineId || x.name === lineId);
  if (!l) return;

  const modal = document.getElementById('disruption-modal');
  document.getElementById('modal-title').textContent = `Betriebslage Linie ${l.id || l.name}`;
  document.getElementById('modal-body').innerHTML = `
    <p style="line-height:1.6; color:var(--text-primary);">${escapeHtml(l.description || 'Fahrplanmäßiger Betrieb.')}</p>
  `;
  modal.style.display = 'flex';
};

// ==========================================================================
// 17. Cologne Widgets (Tab 8)
// ==========================================================================
async function loadWidgets() {
  try {
    const res = await fetch('/api/widgets');
    if (!res.ok) return;
    state.widgets = await res.json();

    if (state.widgets.pegel) {
      const p = state.widgets.pegel;
      const pegelValEl = document.getElementById('pegel-cm-val');
      if (pegelValEl) pegelValEl.textContent = p.value || '--';
      const headerPegel = document.getElementById('header-pegel-val');
      if (headerPegel) headerPegel.textContent = `${p.value || 110} cm`;
    }

    if (state.widgets.weather) {
      const w = state.widgets.weather;
      const tempValEl = document.getElementById('weather-temp-val');
      if (tempValEl) tempValEl.textContent = Math.round(w.temp || 18);
      const headerW = document.getElementById('header-weather-val');
      if (headerW) headerW.textContent = `${Math.round(w.temp || 18)}°C`;
    }

    if (state.widgets.parking) {
      const pk = state.widgets.parking;
      const freeEl = document.getElementById('parking-total-free');
      if (freeEl) freeEl.textContent = (pk.totalFree || 0).toLocaleString('de-DE');
    }
  } catch (e) {
    console.warn('Widgets error:', e.message);
  }
}

function initWidgetsView() {}

// ==========================================================================
// 18. Köln AI City Concierge (Tab 9 & Floating Map Assistant)
// ==========================================================================
function initAIChatView() {
  const form = document.getElementById('ai-chat-form');
  const input = document.getElementById('ai-chat-input');
  const chatMessages = document.getElementById('ai-chat-messages');

  if (!form || !input || !chatMessages) return;

  document.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.getAttribute('data-ai-prompt');
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;

    appendChatMessage('user', prompt);
    input.value = '';

    const loadingId = 'ai-loading-' + Date.now();
    chatMessages.insertAdjacentHTML('beforeend', `
      <div class="ai-msg bot-msg" id="${loadingId}">
        <div class="ai-msg-avatar">⚡</div>
        <div class="ai-msg-content">
          <div class="spinner" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:6px;"></div>
          <span>Analysiere KVB- & City-Live-Daten...</span>
        </div>
      </div>
    `);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      const data = await res.json();
      document.getElementById(loadingId)?.remove();

      if (data && data.answer) {
        appendChatMessage('assistant', data.answer, data.mapAction);
      } else {
        appendChatMessage('assistant', 'Derzeit keine Antwort verfügbar.');
      }
    } catch (err) {
      document.getElementById(loadingId)?.remove();
      appendChatMessage('assistant', `Fehler: ${err.message}`);
    }
  });
}

function appendChatMessage(role, text, mapAction = null) {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `ai-msg ${role === 'user' ? 'user-msg' : 'bot-msg'}`;

  let formattedText = escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  let actionHtml = '';
  if (mapAction) {
    actionHtml = `
      <div class="mt-2">
        <button class="action-btn primary small" onclick='window.appExecuteMapAction(${JSON.stringify(mapAction)})'>
          Auf Live-Karte anzeigen ➔
        </button>
      </div>
    `;
  }

  msgDiv.innerHTML = `
    <div class="ai-msg-avatar">${role === 'user' ? '👤' : '⚡'}</div>
    <div class="ai-msg-content">
      <div>${formattedText}</div>
      ${actionHtml}
    </div>
  `;

  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

window.appExecuteMapAction = function(action) {
  executeMapAction(action);
};

function initMapFloatingAI() {
  const triggerBtn = document.getElementById('map-ai-trigger-btn');
  const panel = document.getElementById('map-ai-panel');
  const closeBtn = document.getElementById('map-ai-close-btn');
  const form = document.getElementById('map-ai-form');
  const input = document.getElementById('map-ai-input');
  const messagesContainer = document.getElementById('map-ai-messages');

  if (!triggerBtn || !panel || !form || !input || !messagesContainer) return;

  triggerBtn.addEventListener('click', () => {
    panel.style.display = 'flex';
    triggerBtn.style.display = 'none';
    input.focus();
  });

  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
    triggerBtn.style.display = 'flex';
  });

  document.querySelectorAll('.map-ai-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      input.value = pill.getAttribute('data-prompt');
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;

    appendFloatingAiMessage('user', prompt);
    input.value = '';

    const loadingId = 'map-ai-load-' + Date.now();
    messagesContainer.insertAdjacentHTML('beforeend', `
      <div class="ai-msg bot-msg" id="${loadingId}">
        <div class="ai-msg-avatar">⚡</div>
        <div class="ai-msg-content">
          <div class="spinner" style="width:14px; height:14px; display:inline-block; vertical-align:middle; margin-right:6px;"></div>
          <span>Berechne auf Live-Karte...</span>
        </div>
      </div>
    `);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      const data = await res.json();
      document.getElementById(loadingId)?.remove();

      if (data && data.answer) {
        appendFloatingAiMessage('bot', data.answer, data.mapAction);
        if (data.mapAction) executeMapAction(data.mapAction);
      } else {
        appendFloatingAiMessage('bot', 'Keine Antwort verfügbar.');
      }
    } catch (err) {
      document.getElementById(loadingId)?.remove();
      appendFloatingAiMessage('bot', `Fehler: ${err.message}`);
    }
  });
}

function appendFloatingAiMessage(role, text, mapAction = null) {
  const container = document.getElementById('map-ai-messages');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `ai-msg ${role === 'user' ? 'user-msg' : 'bot-msg'}`;

  let formattedText = escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  let actionHtml = '';
  if (mapAction) {
    actionHtml = `
      <div class="mt-2">
        <button class="action-btn primary small" onclick='window.appExecuteMapAction(${JSON.stringify(mapAction)})'>
          Auf Live-Karte zeigen ➔
        </button>
      </div>
    `;
  }

  msgDiv.innerHTML = `
    <div class="ai-msg-avatar">${role === 'user' ? '👤' : '⚡'}</div>
    <div class="ai-msg-content">
      <div>${formattedText}</div>
      ${actionHtml}
    </div>
  `;

  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function executeMapAction(action) {
  if (!action || !state.map) return;

  if (action.type === 'route' && action.start && action.end) {
    plotRouteTrackOnMap({
      fromName: action.fromName || 'Start',
      toName: action.toName || 'Ziel',
      coordinates: action.waypoints || [action.start, action.end],
      lineColor: action.lineColor || '#00f0ff',
      startPoint: action.start,
      endPoint: action.end,
      lineName: action.line ? `Linie ${action.line}` : null
    });
  } else if (action.type === 'focus' && action.lat && action.lng) {
    switchTab('map');
    state.map.flyTo([action.lat, action.lng], action.zoom || 16);
  }
}

// ==========================================================================
// 19. Swipe Gestures & Geolocation
// ==========================================================================
let gpsWatchId = null;
function toggleGPSTracking() {
  const btn = document.getElementById('gps-track-btn');
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
    btn?.classList.remove('active');
    if (state.userLocationMarker) state.map.removeLayer(state.userLocationMarker);
    if (state.userAccuracyCircle) state.map.removeLayer(state.userAccuracyCircle);
    return;
  }

  if (!navigator.geolocation) {
    alert('Geolocation wird nicht unterstützt.');
    return;
  }

  btn?.classList.add('active');
  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const latlng = [latitude, longitude];

      if (!state.userLocationMarker) {
        state.userLocationMarker = L.circleMarker(latlng, {
          radius: 8,
          color: '#fff',
          fillColor: '#00f0ff',
          fillOpacity: 1,
          weight: 2
        }).addTo(state.map);
        state.userAccuracyCircle = L.circle(latlng, { radius: accuracy, color: '#00f0ff', fillOpacity: 0.1, weight: 1 }).addTo(state.map);
        state.map.flyTo(latlng, 15);
      } else {
        state.userLocationMarker.setLatLng(latlng);
        state.userAccuracyCircle.setLatLng(latlng);
        state.userAccuracyCircle.setRadius(accuracy);
      }
    },
    (err) => {
      console.warn('GPS Error:', err.message);
      btn?.classList.remove('active');
      gpsWatchId = null;
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function initSwipeGestures() {
  const setupSwipe = (element, closeCallback) => {
    if (!element) return;
    let startY = 0;
    let isSwiping = false;

    element.addEventListener('touchstart', (e) => {
      if (element.scrollTop <= 5 || e.target.closest('.sheet-drag-handle')) {
        startY = e.touches[0].clientY;
        isSwiping = true;
      }
    }, { passive: true });

    element.addEventListener('touchmove', (e) => {
      if (!isSwiping) return;
      const deltaY = e.touches[0].clientY - startY;
      if (deltaY > 0) element.style.transform = `translateY(${deltaY}px)`;
    }, { passive: true });

    element.addEventListener('touchend', (e) => {
      if (!isSwiping) return;
      isSwiping = false;
      const deltaY = (e.changedTouches[0]?.clientY || 0) - startY;
      element.style.transform = '';
      if (deltaY > 60) {
        triggerHaptic(12);
        closeCallback();
      }
    }, { passive: true });
  };

  setupSwipe(document.getElementById('station-drawer'), closeStationDrawer);
  setupSwipe(document.getElementById('vehicle-drawer'), () => {
    const el = document.getElementById('vehicle-drawer');
    if (el) el.style.display = 'none';
  });
  setupSwipe(document.getElementById('map-ai-panel'), () => {
    const el = document.getElementById('map-ai-panel');
    if (el) el.style.display = 'none';
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
