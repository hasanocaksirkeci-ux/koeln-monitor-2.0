import { ICONS, getIcon } from './icons.js';
import { renderSparkline, renderBarChart } from './charts.js';

/**
 * Köln Live-Monitor: Vexto-Grade Mission Control Application Engine
 * Layer 2 & 4: Navigation, High-Def 3-Mode Leaflet Map, Track-Snapping Radar, Blaulicht, KVB-Rad & Köln AI
 */

// ==========================================================================
// 1. Global State
// ==========================================================================
const state = {
  theme: localStorage.getItem('koeln_theme') || 'dark',
  activeTab: 'home',
  mapMode: 'dark', // 'dark' | 'light' | 'satellite'

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
  analyticsLineFilter: 'stadtbahn', // 'stadtbahn' | 'bus' | 'all' - see renderAnalyticsLines()

  // Map Filter Toggles - deliberately minimal by default (only the core
  // "wo fahren gerade Bahnen"-Bild). Everything else stays real and just
  // a click away in the Ebenen-Menu instead of all rendering at once on
  // first load (was 9 of 10 layers on simultaneously - unreadable clutter).
  filters: {
    trains: true,          // KVB Stadtbahnen Live-Radar
    buses: false,          // KVB Busse Live-Radar
    tracksBahn: true,      // Stadtbahn-Netz & U-Bahn-Tunnel
    tracksBus: false,      // KVB Bus-Netz & Korridore
    stations: true,        // Haltestellen & U-Bahnhöfe
    emergencies: false,    // Polizei & Feuerwehr
    bikes: false,          // KVB-Rad
    traffic: false,        // TomTom Live-Verkehr
    parking: false,        // Parkleitsystem
    pegel: false            // Rheinpegel-Standort
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

  // Routenplaner: 'kvb' (ÖPNV, unverändert) | 'car' | 'bicycle' | 'pedestrian' (TomTom)
  routeMode: 'kvb',

  // Rolling history for KPI sparklines (Design Rebuild Phase 1) - real
  // values only, appended each time the corresponding source updates.
  history: {
    fleetCount: [],
    punctuality: []
  },

  // Favorites
  favorites: JSON.parse(localStorage.getItem('koeln_favs') || '[]'),

  // City Data
  verifiedStations: [],
  lineTracks: [],
  disruptions: null,
  widgets: null,

  // Central Normalized Data Stores (LIVE, LOADING, STALE, UNAVAILABLE, ERROR)
  dataStores: {
    radar: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'KVB HAFAS Radar' },
    departures: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'KVB HAFAS' },
    emergencies: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'Presseportal Polizei Köln' },
    bikes: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'Nextbike / KVB Rad' },
    analytics: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'KVB Analytics Engine' },
    disruptions: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'KVB Betriebslage' },
    widgets: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'Köln City-Widgets' },
    widgets_pegel: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'WSV PegelOnline' },
    widgets_parking: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'Stadt Köln Open Data' },
    widgets_weather: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'Open-Meteo' },
    traffic: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'TomTom Traffic' },
    traffic_config: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'TomTom Config' },
    routes: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'KVB Routenplanung' },
    routes_drive: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'TomTom Routing' },
    events: { status: 'LOADING', lastSuccessfulUpdate: null, data: null, error: null, source: 'Stadt Köln Open Data (Events)' }
  }
};

// ==========================================================================
// Central State Normalization & Status Rendering Engine
// ==========================================================================

export function formatTimeAgo(isoStr) {
  if (!isoStr) return '';
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(isoStr).getTime()) / 1000));
  if (diffSec < 60) return `vor ${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `vor ${diffMin}m`;
  const diffHours = Math.round(diffMin / 60);
  return `vor ${diffHours}h`;
}

export function renderDataStatus(storeOrKey, fallbackLabel = '') {
  const store = typeof storeOrKey === 'string' ? state.dataStores[storeOrKey] : storeOrKey;
  if (!store) return '';
  const status = store.status || 'LOADING';
  const timeStr = store.lastSuccessfulUpdate ? formatTimeAgo(store.lastSuccessfulUpdate) : '';

  switch (status) {
    case 'LIVE':
      return `<span class="data-status-badge status-live" title="Letztes Update: ${timeStr}"><span class="status-dot">●</span> LIVE <span class="status-sub">${timeStr}</span></span>`;
    case 'LOADING':
      return `<span class="data-status-badge status-loading"><span class="status-dot">◐</span> LÄDT...</span>`;
    case 'STALE':
      return `<span class="data-status-badge status-stale" title="Letztes erfolgreiches Update: ${timeStr}"><span class="status-dot">◷</span> VERZÖGERT <span class="status-sub">${timeStr}</span></span>`;
    case 'UNAVAILABLE':
      return `<span class="data-status-badge status-unavailable" title="${escapeHtml(store.error || 'Quelle derzeit nicht verfügbar')}"><span class="status-dot">⚠</span> NICHT VERFÜGBAR</span>`;
    case 'ERROR':
      return `<span class="data-status-badge status-error" title="${escapeHtml(store.error || 'Fehler beim Laden')}"><span class="status-dot">⛔</span> FEHLER</span>`;
    default:
      return `<span class="data-status-badge status-unavailable">${escapeHtml(fallbackLabel || status)}</span>`;
  }
}

// Appends a real value to a capped rolling history buffer used for KPI
// sparklines (Design Rebuild Phase 1). Ignores non-numeric values instead
// of pushing a fabricated 0/null placeholder into the chart.
const HISTORY_MAX_POINTS = 24;
function pushHistory(key, value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return;
  const arr = state.history[key];
  if (!arr) return;
  arr.push(value);
  if (arr.length > HISTORY_MAX_POINTS) arr.shift();
}

// Small helper: writes a rendered badge (or any HTML) into a designated
// status-slot element without throwing if the slot isn't present in the
// current DOM (e.g. a different active tab).
function setSlotHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// Maps the nested per-field status vocabulary used inside the combined
// /api/widgets payload (lowercase 'live'/'stale', e.g. state.widgets.pegel.status)
// onto the same LIVE/STALE/UNAVAILABLE vocabulary the central dataStores /
// renderDataStatus() badge system uses, so Pegel/Wetter/Parken get real badges
// instead of a second, invisible status language (Schritt 4).
export function syncWidgetSubStore(storeKey, fieldPayload, parentStore) {
  const sub = state.dataStores[storeKey];
  if (!sub) return;

  if (!fieldPayload) {
    sub.status = parentStore.status === 'ERROR' ? 'ERROR' : 'UNAVAILABLE';
    sub.error = parentStore.error || 'Keine Daten empfangen';
    return;
  }

  const fieldStatus = String(fieldPayload.status || '').toLowerCase();
  if (fieldStatus === 'live') {
    sub.status = 'LIVE';
    sub.error = null;
    sub.lastSuccessfulUpdate = parentStore.lastSuccessfulUpdate;
  } else if (fieldStatus === 'stale') {
    sub.status = 'STALE';
    sub.error = fieldPayload.error || null;
    sub.lastSuccessfulUpdate = sub.lastSuccessfulUpdate || parentStore.lastSuccessfulUpdate;
  } else {
    sub.status = 'UNAVAILABLE';
    sub.error = fieldPayload.error || 'Quelle derzeit nicht verfügbar';
  }
}

export async function normalizeApiFetch(key, fetchUrlOrPromise, options = {}) {
  const { force = false, freshnessWindow = 0, ...fetchOptions } = options;

  let store = state.dataStores[key];
  if (!store) {
    store = {
      status: 'LOADING',
      lastSuccessfulUpdate: null,
      lastFetchTime: 0,
      data: null,
      error: null,
      source: null,
      generation: 0,
      activeController: null,
      isFetching: false
    };
    state.dataStores[key] = store;
  }

  // 1. Freshness Window Protection (Cache hit if data is fresh and live)
  if (!force && freshnessWindow > 0 && store.status === 'LIVE' && store.data != null) {
    const ageMs = Date.now() - (store.lastFetchTime || 0);
    if (ageMs < freshnessWindow) {
      return store;
    }
  }

  // 2. Concurrency Guard & Abort Strategy
  if (store.isFetching) {
    if (force) {
      // Abort in-flight request on forced manual refresh
      if (store.activeController) {
        try {
          store.activeController.abort();
        } catch (e) {}
      }
    } else {
      // Background poll or rapid switch: reuse in-flight request without spawning duplicate
      return store;
    }
  }

  // 3. Request Generation ID (Prevents slower old responses from overwriting newer state)
  store.generation = (store.generation || 0) + 1;
  const thisGen = store.generation;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  store.activeController = controller;
  store.isFetching = true;

  try {
    const mergedOptions = controller ? { ...fetchOptions, signal: controller.signal } : fetchOptions;
    const res = typeof fetchUrlOrPromise === 'string'
      ? await fetch(fetchUrlOrPromise, mergedOptions)
      : await fetchUrlOrPromise;

    // Discard stale response if a newer request generation was started
    if (thisGen !== store.generation) {
      return store;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
    }

    const data = await res.json();

    if (thisGen !== store.generation) {
      return store;
    }

    // Check if backend returned structured error
    if (data.status === 'error' || (data.error && !data.status)) {
      if (store.data != null) {
        store.status = 'STALE';
        store.error = data.error || 'Upstream Error';
      } else {
        store.status = 'ERROR';
        store.data = null;
        store.error = data.error || 'Upstream Error';
      }
      return store;
    }

    if (data.status === 'unconfigured' || data.configured === false) {
      store.status = 'UNAVAILABLE';
      store.data = data;
      store.error = data.error || 'Nicht konfiguriert';
      store.source = data.source || store.source;
      return store;
    }

    if (data.status === 'stale' || data.isStale) {
      store.status = 'STALE';
      store.data = data;
      store.error = data.error || null;
      store.source = data.source || store.source;
      if (data.lastSuccessfulUpdate) {
        store.lastSuccessfulUpdate = data.lastSuccessfulUpdate;
      }
      return store;
    }

    if (data.status === 'unavailable') {
      store.status = 'UNAVAILABLE';
      store.data = data;
      store.error = data.error || null;
      store.source = data.source || store.source;
      return store;
    }

    // Live success
    store.status = 'LIVE';
    store.data = data;
    store.error = null;
    store.source = data.source || store.source;
    store.lastSuccessfulUpdate = data.lastSuccessfulUpdate || data.timestamp || new Date().toISOString();
    store.lastFetchTime = Date.now();
    return store;
  } catch (err) {
    // Explicit Abort handling - Abort is NOT an API error
    if (err.name === 'AbortError' || controller?.signal?.aborted) {
      return store;
    }

    // Ignore if superseded by newer generation
    if (thisGen !== store.generation) {
      return store;
    }

    if (store.data != null) {
      store.status = 'STALE';
      store.error = err.message;
    } else {
      store.status = 'ERROR';
      store.data = null;
      store.error = err.message;
    }
    return store;
  } finally {
    if (thisGen === store.generation) {
      store.isFetching = false;
      store.activeController = null;
    }
  }
}

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
  initEventsView();
  initHomeView();
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
  // Explicitly (re-)apply the default tab instead of relying only on the
  // static HTML `active` classes - switchTab() also sets runtime-only
  // state the markup can't express (mobile sidebar-drawer open state,
  // background map dimming), which otherwise stayed unset on first load.
  switchTab(state.activeTab);
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
    brandHome.addEventListener('click', () => switchTab('home'));
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
  const transitHud = document.getElementById('transit-hud-bar');
  if (sidebar && window.innerWidth <= 900) {
    if (tabId === 'map') {
      sidebar.classList.remove('mobile-open');
      if (transitHud) transitHud.style.display = 'flex';
    } else {
      sidebar.classList.add('mobile-open');
      if (transitHud) transitHud.style.display = 'none';
    }
  } else if (transitHud) {
    transitHud.style.display = 'flex';
  }

  // The background map recedes into ambient chrome only on the curated
  // Home welcome screen - everywhere else (including Radar) it stays the
  // full operational view it already was. On desktop this also shrinks
  // the map to a small preview card and widens the sidebar into an
  // actual multi-column dashboard (see .home-expanded in style.css) -
  // the two classes are always toggled together.
  const mapStageEl = document.querySelector('.map-stage');
  const sidebarEl = document.querySelector('.dashboard-sidebar');
  const isHome = tabId === 'home';
  if (mapStageEl) mapStageEl.classList.toggle('home-dimmed', isHome);
  if (sidebarEl) sidebarEl.classList.toggle('home-expanded', isHome);

  // The map's actual pixel box changes size when entering/leaving Home
  // (not just a CSS filter), so Leaflet needs to re-measure once the
  // resize transition finishes or its tiles stay cropped to the old box.
  if (state.map) {
    setTimeout(() => state.map.invalidateSize(), 320);
  }

  if (tabId === 'map' && state.map) {
    setTimeout(() => {
      state.map.invalidateSize();
    }, 100);
  } else if (tabId === 'home') {
    loadEvents();
  } else if (tabId === 'departures') {
    fetchDepartures(state.activeStation.id);
  } else if (tabId === 'emergencies') {
    loadEmergencies();
  } else if (tabId === 'bikes') {
    loadBikes();
  } else if (tabId === 'events') {
    loadEvents();
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
      fetchLiveRadar(true);
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

  const transitHudBarEl = document.getElementById('transit-hud-bar');

  if (layersBtn && layersMenu) {
    layersBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willShow = !layersMenu.classList.contains('show');
      layersMenu.classList.toggle('show');
      layersMenu.classList.toggle('open');
      // Two independently-positioned floating overlays (this dropdown and
      // the transit mode HUD) previously overlapped when both were visible.
      // Hide the HUD bar for as long as the dropdown is open instead of
      // fixed-pixel-fighting over the same vertical band.
      if (transitHudBarEl) transitHudBarEl.classList.toggle('hidden-by-layers-menu', willShow);
    });

    layersMenu.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => {
      layersMenu.classList.remove('show');
      layersMenu.classList.remove('open');
      if (transitHudBarEl) transitHudBarEl.classList.remove('hidden-by-layers-menu');
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
  if (state.radarTimer) {
    clearInterval(state.radarTimer);
    state.radarTimer = null;
  }

  fetchLiveRadar(false);
  
  state.radarCountdown = 6;
  state.radarTimer = setInterval(() => {
    state.radarCountdown--;
    const countdownEl = document.getElementById('radar-countdown-text');
    if (countdownEl) countdownEl.textContent = `${state.radarCountdown}s`;

    if (state.radarCountdown <= 0) {
      state.radarCountdown = 6;
      fetchLiveRadar(false);
    }
  }, 1000);
}

async function fetchLiveRadar(force = false) {
  const store = await normalizeApiFetch('radar', '/api/radar', { force });
  setSlotHtml('radar-status-badge', renderDataStatus(store));

  if (store.status === 'LIVE') {
    renderLiveVehicles(store.data?.vehicles || [], store);
  } else if (store.status === 'STALE') {
    console.warn('Radar data stale (keeping existing vehicles):', store.error);
    updateRadarTelemetryStale(store);
  } else if (store.status === 'ERROR' || store.status === 'UNAVAILABLE') {
    if (state.vehiclesMap.size > 0) {
      store.status = 'STALE';
      setSlotHtml('radar-status-badge', renderDataStatus(store));
      updateRadarTelemetryStale(store);
    } else {
      updateRadarTelemetryError(store);
    }
  }
}

function updateRadarTelemetryStale(store) {
  const totalCount = state.vehiclesMap.size;
  const totalHeaderEl = document.getElementById('vehicle-count-header');
  if (totalHeaderEl) totalHeaderEl.textContent = totalCount > 0 ? `${totalCount}` : '--';

  const countdownEl = document.getElementById('radar-countdown-text');
  if (countdownEl && store.lastSuccessfulUpdate) {
    countdownEl.title = `Verzögert: letztes Update ${formatTimeAgo(store.lastSuccessfulUpdate)}`;
  }
  updateVehicleStreamList();
}

function updateRadarTelemetryError(store) {
  const totalHeaderEl = document.getElementById('vehicle-count-header');
  if (totalHeaderEl) totalHeaderEl.textContent = '--';
  const hudStadtbahnEl = document.getElementById('hud-stadtbahn-count');
  if (hudStadtbahnEl) hudStadtbahnEl.textContent = '--';
  const hudBusEl = document.getElementById('hud-bus-count');
  if (hudBusEl) hudBusEl.textContent = '--';

  const container = document.getElementById('vehicle-stream-list');
  if (container) {
    container.innerHTML = `
      <div class="glass-panel p-4 text-center text-rose">
        <div style="font-size:1.5rem; margin-bottom:0.4rem;">⛔</div>
        <div style="font-weight:700;">Radar vorübergehend nicht erreichbar</div>
        <div class="text-muted mt-1" style="font-size:0.75rem;">${escapeHtml(store.error || 'Verbindung zum KVB-Server fehlgeschlagen')}</div>
      </div>
    `;
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

function renderLiveVehicles(vehicles, store = null) {
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

  pushHistory('fleetCount', totalCount);
  renderSparkline(document.getElementById('fleet-sparkline'), state.history.fleetCount, { color: '#00f0ff' });

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
  if (!state.map || !coordinates || coordinates.length < 2) return false;

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
  return true;
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
async function loadEmergencies(force = false) {
  const store = await normalizeApiFetch('emergencies', '/api/emergencies', { force, freshnessWindow: 20000 });
  setSlotHtml('emergency-status-badge', renderDataStatus(store));
  setSlotHtml('emergencies-panel-status-badge', renderDataStatus(store));

  if (store.status === 'LIVE' || store.status === 'STALE') {
    state.emergencies = store.data?.emergencies || [];
    const count = state.emergencies.length;

    const headerEm = document.getElementById('header-emergency-val');
    if (headerEm) headerEm.textContent = count;
    const hudEm = document.getElementById('hud-emergency-count');
    if (hudEm) hudEm.textContent = count;

    renderEmergencyMarkers();
    renderEmergenciesList();
  } else {
    const headerEm = document.getElementById('header-emergency-val');
    if (headerEm) headerEm.textContent = '--';
    const hudEm = document.getElementById('hud-emergency-count');
    if (hudEm) hudEm.textContent = '--';

    const container = document.getElementById('emergencies-list');
    if (container && state.emergencies.length === 0) {
      container.innerHTML = `
        <div class="glass-panel p-4 text-center text-rose">
          <div style="font-size:1.5rem; margin-bottom:0.4rem;">⛔</div>
          <div style="font-weight:700;">Blaulicht-Daten nicht verfügbar</div>
          <div class="text-muted mt-1" style="font-size:0.75rem;">${escapeHtml(store.error || 'Fehler beim Laden')}</div>
        </div>
      `;
    }
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

  // Title leads the card - the source attribution ("Polizei Köln" /
  // "Feuerwehr") is provenance, not the headline, so it moved into the
  // secondary meta row instead of being the first thing shown.
  container.innerHTML = filtered.map(em => `
    <div class="glass-panel p-4" style="cursor:pointer;" onclick="window.appOpenEmergency('${em.id}')">
      <h4 style="font-weight:700; font-size:0.95rem;">${escapeHtml(em.title)}</h4>
      <div class="mt-2" style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
        <span class="dock-badge-alert">${em.category === 'fire' ? 'Feuerwehr' : 'Polizei Köln'}</span>
        <span class="text-muted mono" style="font-size:0.75rem;">${em.timeAgo || 'heute'}</span>
      </div>
      <div class="mt-3" style="display:flex; justify-content:space-between; align-items:center;">
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
async function loadBikes(force = false) {
  const store = await normalizeApiFetch('bikes', '/api/bikes', { force, freshnessWindow: 20000 });
  setSlotHtml('bikes-status-badge', renderDataStatus(store));

  if (store.status === 'LIVE' || store.status === 'STALE') {
    state.bikesData = store.data;

    const avail = typeof state.bikesData?.totalAvailableBikes === 'number' ? state.bikesData.totalAvailableBikes : null;
    const stats = typeof state.bikesData?.totalStations === 'number' ? state.bikesData.totalStations : null;

    const availEl = document.getElementById('bikes-total-available');
    if (availEl) availEl.textContent = avail !== null ? avail.toLocaleString('de-DE') : '--';
    const statsEl = document.getElementById('bikes-total-stations');
    if (statsEl) statsEl.textContent = stats !== null ? stats.toLocaleString('de-DE') : '--';
    const hudBikes = document.getElementById('hud-bikes-count');
    if (hudBikes) hudBikes.textContent = avail !== null ? avail.toLocaleString('de-DE') : '--';

    renderBikeMarkers();
    renderBikesList();
  } else {
    const availEl = document.getElementById('bikes-total-available');
    if (availEl) availEl.textContent = '--';
    const statsEl = document.getElementById('bikes-total-stations');
    if (statsEl) statsEl.textContent = '--';
    const hudBikes = document.getElementById('hud-bikes-count');
    if (hudBikes) hudBikes.textContent = '--';

    const container = document.getElementById('bikes-stations-grid');
    if (container && !state.bikesData) {
      container.innerHTML = `
        <div class="glass-panel p-4 text-center text-rose">
          <div style="font-size:1.5rem; margin-bottom:0.4rem;">⛔</div>
          <div style="font-weight:700;">KVB-Rad Live-Daten nicht verfügbar</div>
          <div class="text-muted mt-1" style="font-size:0.75rem;">${escapeHtml(store.error || 'Fehler beim Laden')}</div>
        </div>
      `;
    }
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

// The "Parkleitsystem" layer toggle existed (state.parkingMarkersGroup was
// created and could be shown/hidden) but nothing ever populated it with
// markers - the checkbox toggled an empty group. Same real-data garages
// already used for the sidebar widget (public/app.js loadWidgets), just
// drawn on the map too.
function renderParkingMarkers(garages) {
  if (!state.parkingMarkersGroup) return;
  state.parkingMarkersGroup.clearLayers();

  garages.forEach(g => {
    if (!g.coordinates || typeof g.coordinates.lat !== 'number' || typeof g.coordinates.lng !== 'number') return;
    if (g.free === null || typeof g.free !== 'number') return; // no live data for this garage - don't draw a fake pin

    const isFull = g.status === 'full';
    const badgeHtml = `
      <div style="background:${isFull ? '#475569' : 'var(--vexto-emerald, #10B981)'}; color:#000; font-weight:800; font-size:0.65rem; padding:2px 6px; border-radius:999px; border:1px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.4);">
        🅿️ ${g.free}
      </div>
    `;

    const icon = L.divIcon({
      className: 'parking-div-icon',
      html: badgeHtml,
      iconSize: [40, 18],
      iconAnchor: [20, 9]
    });

    const marker = L.marker([g.coordinates.lat, g.coordinates.lng], { icon, zIndexOffset: 280 });
    marker.bindPopup(`<b>${escapeHtml(g.name || 'Parkhaus')}</b><br>Freie Plätze: <b>${g.free}</b>${typeof g.total === 'number' ? ` / ${g.total}` : ''}`);
    state.parkingMarkersGroup.addLayer(marker);
  });
}

// Known, fixed real-world location of the WSV Pegel-Messstation Köln
// (Rhein-km 688.0, Deutzer Brücke) - a single physical gauge, not
// something the API returns coordinates for, so it's hardcoded here the
// same way GARAGE_CAPACITIES hardcodes known static garage sizes.
const PEGEL_KOELN_COORDS = { lat: 50.9369, lng: 6.9700 };

function renderPegelMarker(pegel) {
  if (!state.pegelGroup) return;
  state.pegelGroup.clearLayers();

  const hasLiveValue = pegel && (pegel.status === 'live' || pegel.status === 'stale') &&
    (typeof pegel.valueCm === 'number' || typeof pegel.value === 'number');
  if (!hasLiveValue) return; // no fake marker without a real reading

  const val = pegel.valueCm ?? pegel.value;
  const badgeHtml = `
    <div style="background:var(--vexto-cyan, #00f0ff); color:#05070a; font-weight:800; font-size:0.65rem; padding:2px 6px; border-radius:999px; border:1px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.4);">
      🌊 ${val} cm
    </div>
  `;
  const icon = L.divIcon({
    className: 'pegel-div-icon',
    html: badgeHtml,
    iconSize: [56, 18],
    iconAnchor: [28, 9]
  });

  const marker = L.marker([PEGEL_KOELN_COORDS.lat, PEGEL_KOELN_COORDS.lng], { icon, zIndexOffset: 280 });
  marker.bindPopup(`<b>Rheinpegel Köln</b><br>Pegelstand: <b>${val} cm</b>${pegel.statusText ? `<br>${escapeHtml(pegel.statusText)}` : ''}`);
  state.pegelGroup.addLayer(marker);
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
async function loadAnalytics(force = false) {
  const store = await normalizeApiFetch('analytics', '/api/analytics', { force, freshnessWindow: 30000 });
  setSlotHtml('header-punctuality-status-badge', renderDataStatus(store));
  setSlotHtml('analytics-status-badge', renderDataStatus(store));

  if (store.status === 'LIVE' || store.status === 'STALE') {
    state.analytics = store.data;

    const score = typeof state.analytics?.punctualityScore === 'number'
      ? state.analytics.punctualityScore
      : null;
    const tracked = typeof state.analytics?.totalTracked === 'number'
      ? state.analytics.totalTracked
      : null;
    const avg = typeof state.analytics?.averageDelayMinutes === 'number'
      ? state.analytics.averageDelayMinutes
      : null;

    const headerPunct = document.getElementById('header-punctuality-val');
    if (headerPunct) headerPunct.textContent = score !== null ? `${score.toFixed(1)}%` : '--';

    if (score !== null) {
      pushHistory('punctuality', score);
      renderSparkline(document.getElementById('punctuality-sparkline'), state.history.punctuality, { color: '#10b981' });
    }
    
    const scoreVal = document.getElementById('an-score-val');
    if (scoreVal) scoreVal.textContent = score !== null ? `${score.toFixed(1)}%` : 'Keine Daten';
    
    const trackedVal = document.getElementById('an-total-tracked');
    if (trackedVal) trackedVal.textContent = tracked !== null ? tracked : '--';
    
    const avgDelay = document.getElementById('an-avg-delay');
    if (avgDelay) avgDelay.textContent = avg !== null ? `${avg} Min` : '--';

    renderAnalyticsLines();
  } else {
    const headerPunct = document.getElementById('header-punctuality-val');
    if (headerPunct) headerPunct.textContent = '--';
    const scoreVal = document.getElementById('an-score-val');
    if (scoreVal) scoreVal.textContent = 'Nicht verfügbar';
    const trackedVal = document.getElementById('an-total-tracked');
    if (trackedVal) trackedVal.textContent = '--';
    const avgDelay = document.getElementById('an-avg-delay');
    if (avgDelay) avgDelay.textContent = '--';

    const tbody = document.getElementById('analytics-lines-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-rose">Analytics derzeit nicht verfügbar</td></tr>`;
    }
    const chartEl = document.getElementById('analytics-line-chart');
    if (chartEl) chartEl.innerHTML = '<div class="chart-empty-note">Analytics derzeit nicht verfügbar</div>';
  }
}

function renderAnalyticsLines() {
  const tbody = document.getElementById('analytics-lines-tbody');
  if (!tbody || !state.analytics) return;

  const allLines = state.analytics.linePerformance || [];
  const lineFilter = state.analyticsLineFilter || 'stadtbahn';
  const lines = (lineFilter === 'all' ? allLines : allLines.filter(l => l.product === lineFilter))
    .slice()
    .sort((a, b) => a.punctuality - b.punctuality); // most-affected lines first

  const chartEl = document.getElementById('analytics-line-chart');
  renderBarChart(
    chartEl,
    lines.map(l => ({
      label: `L${l.line}`,
      value: Math.round(l.punctuality),
      color: l.punctuality >= 90 ? '#10b981' : '#f59e0b'
    })),
    { unit: '%' }
  );

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

  // 52 real lines (12 Stadtbahn + 40 Busse) don't fit in one readable
  // bar chart / table at once - default to the Stadtbahn subset, same
  // pill-filter pattern already used for the Störungen tab.
  document.querySelectorAll('[data-analytics-line-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-analytics-line-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.analyticsLineFilter = btn.getAttribute('data-analytics-line-filter');
      renderAnalyticsLines();
    });
  });
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

  const cfgStore = await normalizeApiFetch('traffic_config', '/api/traffic/config');
  if (cfgStore.status === 'LIVE' && cfgStore.data?.flowTileUrl) {
    if (state.trafficFlowLayer) {
      state.map.removeLayer(state.trafficFlowLayer);
    }
    state.trafficFlowLayer = L.tileLayer(cfgStore.data.flowTileUrl, {
      maxZoom: 18,
      opacity: 0.85,
      zIndex: 400,
      attribution: cfgStore.data.attribution || '&copy; TomTom Traffic'
    });
    if (state.filters.traffic) {
      state.trafficFlowLayer.addTo(state.map);
    }
  }

  // Load Incident Points (Traffic Jams & Road Closures)
  const incStore = await normalizeApiFetch('traffic', '/api/traffic/incidents');
  setSlotHtml('traffic-status-badge', renderDataStatus(incStore));

  if (incStore.status === 'LIVE' || incStore.status === 'STALE') {
    renderTomTomIncidents(incStore.data?.incidents || []);
  } else if (incStore.status === 'UNAVAILABLE') {
    if (state.trafficIncidentsGroup) state.trafficIncidentsGroup.clearLayers();
    console.info('TomTom Traffic: Nicht konfiguriert');
  } else {
    console.warn('TomTom incidents error:', incStore.error);
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

  const store = await normalizeApiFetch('departures', `/api/departures?stopId=${encodeURIComponent(stopId)}`);
  setSlotHtml('departures-status-badge', renderDataStatus(store));

  if (store.status === 'LIVE' || store.status === 'STALE') {
    state.departures = store.data?.departures || [];
    renderDrawerDepartures();
  } else {
    listEl.innerHTML = `<div class="text-rose py-4 text-center">⛔ Abfahrten nicht verfügbar (${escapeHtml(store.error || 'Fehler beim Laden')})</div>`;
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
      fetchDepartures(state.activeStation.id, true);
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

async function fetchDepartures(stopId, force = false) {
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

  const store = await normalizeApiFetch('departures', `/api/departures?stopId=${encodeURIComponent(stopId)}`, { force, freshnessWindow: 10000 });
  setSlotHtml('departures-status-badge', renderDataStatus(store));

  if (store.status === 'LIVE' || store.status === 'STALE') {
    state.departures = store.data?.departures || [];
    renderDeparturesTable();
  } else {
    tbody.innerHTML = `<tr><td colspan="4" class="text-rose py-4 text-center">⛔ Abfahrten derzeit nicht verfügbar (${escapeHtml(store.error || 'Fehler beim Laden')})</td></tr>`;
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
        <div class="search-item" data-station-id="${s.id}">
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

  // Event delegation scoped to this dropdown, closing over this specific
  // inputEl/onSelect pair. Previously this used a single global
  // window.appAutocompleteSelect reassigned on every setupAutocomplete()
  // call - wiring up a second autocomplete (e.g. the Routenplaner's Ziel
  // field right after its Start field) silently overwrote the first one's
  // callback, so a click in the Start dropdown could route through the
  // Ziel input's handler.
  dropdownEl.addEventListener('click', (e) => {
    const item = e.target.closest('[data-station-id]');
    if (!item) return;
    const st = state.verifiedStations.find(s => s.id === item.getAttribute('data-station-id'));
    if (st) {
      inputEl.value = st.name;
      dropdownEl.style.display = 'none';
      onSelect(st);
    }
  });

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

  // Station-suggestion dropdown while typing (reuses the same component
  // already used for the Abfahrten-Tab search) - previously these were
  // plain text inputs with no suggestions at all.
  const fromAutocomplete = document.getElementById('route-from-autocomplete');
  const toAutocomplete = document.getElementById('route-to-autocomplete');
  if (fromAutocomplete) setupAutocomplete(fromInput, fromAutocomplete, () => {});
  if (toAutocomplete) setupAutocomplete(toInput, toAutocomplete, () => {});

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      fromInput.value = e.currentTarget.getAttribute('data-from');
      toInput.value = e.currentTarget.getAttribute('data-to');
      calcBtn.click();
    });
  });

  document.querySelectorAll('[data-route-mode]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-route-mode]').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      state.routeMode = e.currentTarget.getAttribute('data-route-mode');
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
  if (state.routeMode === 'kvb') {
    return calculateKvbRoute(from, to);
  }
  return calculateDriveRoute(from, to, state.routeMode);
}

async function calculateKvbRoute(from, to) {
  const container = document.getElementById('route-results-container');
  const listEl = document.getElementById('route-cards-list');
  container.style.display = 'block';

  listEl.innerHTML = `
    <div class="glass-panel text-center py-6">
      <div class="spinner"></div>
      <div class="mt-2 text-muted">Berechne Verbindung von "${escapeHtml(from)}" nach "${escapeHtml(to)}"...</div>
    </div>
  `;

  const store = await normalizeApiFetch('routes', `/api/routes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  setSlotHtml('routes-status-badge', renderDataStatus(store));

  if (store.status === 'LIVE' || store.status === 'STALE') {
    const routes = store.data?.routes || [];
    // Each route option already carries its own real, per-leg-sliced
    // trackGeometry from the server (see server.js /api/routes) - it's
    // serialized into routeEncoded below and read back out in
    // appPlotCalculatedRoute, no separate state needed.

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
  } else {
    listEl.innerHTML = `<div class="glass-panel text-center py-6 text-rose">⛔ Verbindung nicht berechenbar: ${escapeHtml(store.error || 'Fehler')}</div>`;
  }
}

const ROUTE_MODE_LABELS = { car: 'Auto', bicycle: 'Rad', pedestrian: 'Fuß' };

async function calculateDriveRoute(from, to, mode) {
  const container = document.getElementById('route-results-container');
  const listEl = document.getElementById('route-cards-list');
  container.style.display = 'block';

  const modeLabel = ROUTE_MODE_LABELS[mode] || mode;
  listEl.innerHTML = `
    <div class="glass-panel text-center py-6">
      <div class="spinner"></div>
      <div class="mt-2 text-muted">Berechne ${modeLabel}-Route von "${escapeHtml(from)}" nach "${escapeHtml(to)}"...</div>
    </div>
  `;

  const store = await normalizeApiFetch('routes_drive', `/api/routes/drive?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&mode=${encodeURIComponent(mode)}`);
  setSlotHtml('routes-status-badge', renderDataStatus(store));

  if ((store.status === 'LIVE' || store.status === 'STALE') && store.data?.status === 'ok') {
    const r = store.data;
    const km = typeof r.distanceMeters === 'number' ? (r.distanceMeters / 1000).toFixed(1) : '--';
    const mins = typeof r.durationSeconds === 'number' ? Math.round(r.durationSeconds / 60) : '--';
    const routeEncoded = encodeURIComponent(JSON.stringify({ coordinates: r.coordinates }));

    listEl.innerHTML = `
      <div class="glass-panel p-4 mb-3">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="mono" style="font-weight:800; font-size:1.1rem;">${km} km</span>
          <span class="dock-badge-alert" style="background:var(--vexto-emerald); color:#000;">
            ${mins} Min. (${modeLabel})
          </span>
        </div>
        <div class="mt-3" style="display:flex; justify-content:flex-end;">
          <button class="action-btn primary small" onclick="window.appPlotDriveRoute('${escapeHtml(from)}', '${escapeHtml(to)}', '${routeEncoded}')">
            Trasse auf Karte zeichnen ➔
          </button>
        </div>
      </div>
    `;
  } else {
    const errMsg = store.data?.error || store.error || 'Route nicht berechenbar';
    listEl.innerHTML = `<div class="glass-panel text-center py-6 text-rose">⛔ ${escapeHtml(errMsg)}</div>`;
  }
}

window.appPlotDriveRoute = function(fromName, toName, routeJsonStr) {
  const warnEl = document.getElementById('route-plot-warning');
  if (warnEl) warnEl.style.display = 'none';

  try {
    const { coordinates } = JSON.parse(decodeURIComponent(routeJsonStr));
    if (coordinates && coordinates.length > 1) {
      plotRouteTrackOnMap({ fromName, toName, coordinates, lineColor: '#f59e0b' });
    } else if (warnEl) {
      warnEl.textContent = '⚠ Route kann derzeit nicht auf der Karte dargestellt werden (keine Streckengeometrie gefunden).';
      warnEl.style.display = 'block';
    }
  } catch (err) {
    console.error('Error plotting drive route:', err);
    if (warnEl) {
      warnEl.textContent = '⚠ Route kann derzeit nicht auf der Karte dargestellt werden (Fehler beim Verarbeiten der Verbindung).';
      warnEl.style.display = 'block';
    }
  }
};

window.appPlotCalculatedRoute = function(fromName, toName, routeJsonStr) {
  const warnEl = document.getElementById('route-plot-warning');
  const showWarning = (msg) => {
    if (warnEl) {
      warnEl.textContent = msg;
      warnEl.style.display = 'block';
    }
  };
  if (warnEl) warnEl.style.display = 'none';

  try {
    const route = JSON.parse(decodeURIComponent(routeJsonStr));
    // Real, per-leg-sliced geometry computed server-side from THIS route's
    // actual legs (getJourneyTrackGeometry) - drawn exactly as described in
    // the text, including the real transfer point. Previously this looked
    // up the matched line's ENTIRE track by number with no slicing at all
    // (Florastr. -> Neumarkt drew all of Linie 1, Leverkusen to Zollstock),
    // and later a from-scratch hub-guess that could disagree with the
    // journey's actual transfer station entirely. No fabricated fallback
    // line anymore - either the real geometry exists or a visible warning
    // is shown.
    const track = route.trackGeometry;
    const transitLines = (track?.segments || []).filter(s => !s.walking && s.line).map(s => String(s.line));
    const uniqueLines = [...new Set(transitLines)];
    const lineName = uniqueLines.length ? `Linie ${uniqueLines.join(' ➔ ')}` : null;
    const lineColor = track?.segments?.find(s => !s.walking)?.color || '#00f0ff';

    if (track && track.coordinates && track.coordinates.length > 1) {
      plotRouteTrackOnMap({
        fromName,
        toName,
        coordinates: track.coordinates,
        lineColor,
        lineName
      });
    } else {
      // Was previously a silent no-op: user clicked "auf Karte zeichnen" and
      // nothing visibly happened. Now shows a visible state instead of
      // drawing something wrong or fabricated.
      showWarning('⚠ Route kann derzeit nicht auf der Karte dargestellt werden (keine Streckengeometrie gefunden).');
    }
  } catch (err) {
    console.error('Error plotting route:', err);
    showWarning('⚠ Route kann derzeit nicht auf der Karte dargestellt werden (Fehler beim Verarbeiten der Verbindung).');
  }
};

// ==========================================================================
// ==========================================================================
// 16. Disruptions & SEV Feed (Tab 6)
// ==========================================================================
const STADTBAHN_TERMINI = {
  '1': 'Weiden West ↔ Bensberg',
  '3': 'Görlinger-Zentrum ↔ Thielenbruch',
  '4': 'Bocklemünd ↔ Schlebusch',
  '5': 'Am Butzweilerhof ↔ Heumarkt',
  '7': 'Frechen Benzelrath ↔ Zündorf',
  '9': 'Sülz ↔ Königsforst',
  '12': 'Merkenich ↔ Zollstock',
  '13': 'Sülzgürtel ↔ Holweide',
  '15': 'Chorweiler ↔ Ubierring',
  '16': 'Niehl ↔ Bonn-Bad Godesberg',
  '17': 'Severinstr. ↔ Rodenkirchen',
  '18': 'Thielenbruch ↔ Bonn Hbf'
};

function initDisruptionsView() {
  const closeModal = () => {
    const modal = document.getElementById('disruption-modal');
    if (modal) modal.style.display = 'none';
  };

  document.getElementById('close-modal-btn')?.addEventListener('click', closeModal);
  document.getElementById('close-modal-btn-top')?.addEventListener('click', closeModal);
  
  const modal = document.getElementById('disruption-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Refresh Button
  document.getElementById('refresh-disruptions-btn')?.addEventListener('click', () => {
    loadDisruptions(true);
  });

  // Filter Buttons
  document.querySelectorAll('[data-disrupt-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-disrupt-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.disruptFilter = btn.getAttribute('data-disrupt-filter');
      renderDisruptionsGrid();
    });
  });
}

// ==========================================================================
// Veranstaltungen (Events) — "was ist los + wie komme ich hin"
// ==========================================================================
// Event delegation: "Route hierhin" buttons are re-rendered on every
// loadEvents() call, so a single listener on the container (same pattern
// as setupAutocomplete's dropdown delegation) avoids re-binding per card.
// Shared across the full Events list and the Home tab's hero/preview
// cards, which render the same button markup.
function wireEventRouteButtons(containerEl) {
  if (!containerEl) return;
  containerEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-route-to-station]');
    if (!btn) return;
    const stationName = btn.getAttribute('data-route-to-station');
    switchTab('routes');
    const toInput = document.getElementById('route-to-input');
    if (toInput) toInput.value = stationName;
  });
}

function initEventsView() {
  const filter = document.getElementById('events-district-filter');
  if (filter) {
    filter.addEventListener('change', () => renderEventCards(state.dataStores.events?.data?.events || []));
  }
  wireEventRouteButtons(document.getElementById('events-list'));
}

async function loadEvents(force = false) {
  const store = await normalizeApiFetch('events', '/api/events?ndays=21', { force, freshnessWindow: 5 * 60 * 1000 });
  setSlotHtml('events-status-badge', renderDataStatus(store));

  const listEl = document.getElementById('events-list');
  if (!listEl) return;

  if (store.status === 'LIVE' || store.status === 'STALE') {
    const events = store.data?.events || [];

    // Populate the Stadtbezirk filter from the events actually returned,
    // instead of a hardcoded district list that could drift from reality.
    const filterEl = document.getElementById('events-district-filter');
    if (filterEl && filterEl.options.length <= 1) {
      const districts = [...new Set(events.map(e => e.district).filter(Boolean))].sort();
      for (const d of districts) {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        filterEl.appendChild(opt);
      }
    }

    renderEventCards(events);
    renderHomeEventPreview(events);
  } else {
    listEl.innerHTML = `<div class="glass-panel text-center py-6 text-muted">Veranstaltungen derzeit nicht verfügbar.</div>`;
    renderHomeEventPreview([]);
  }
}

function renderEventCards(events) {
  const listEl = document.getElementById('events-list');
  if (!listEl) return;

  const activeDistrict = document.getElementById('events-district-filter')?.value || '';
  const filtered = activeDistrict ? events.filter(e => e.district === activeDistrict) : events;

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="glass-panel text-center py-6 text-muted">Keine Veranstaltungen gefunden.</div>`;
    return;
  }

  // Cross-check against the already-loaded Störungen feed - purely a
  // read of existing state, no extra fetch. Only fires once disruptions
  // have actually been loaded at least once this session.
  const disruptedLines = new Set(
    (state.dataStores.disruptions?.data?.lines || [])
      .filter(l => l.status && l.status !== 'green')
      .map(l => String(l.line))
  );

  listEl.innerHTML = filtered.slice(0, 40).map(ev => {
    const start = new Date(ev.startIso);
    const dateLabel = start.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const timeLabel = ev.time || start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    const routeButton = ev.nearestStation
      ? `<button class="pill-btn" data-route-to-station="${escapeHtml(ev.nearestStation.name)}">➔ Route ab ${escapeHtml(ev.nearestStation.short)} (${ev.nearestStation.distanceMeters}m)</button>`
      : '';

    const disruptionWarning = ev.nearestStation && (ev.nearestStation.lines || []).some(l => disruptedLines.has(String(l)))
      ? `<div class="text-amber" style="font-size:0.7rem; margin-top:4px;">⚠ Linie(n) an ${escapeHtml(ev.nearestStation.short)} aktuell gestört</div>`
      : '';

    return `
      <div class="bento-card mb-2" style="padding:0.75rem;">
        <div style="display:flex; justify-content:space-between; gap:0.5rem;">
          <div style="font-weight:700; font-size:0.85rem;">${escapeHtml(ev.title)}</div>
          ${ev.price ? `<span class="badge-tag" style="white-space:nowrap;">${escapeHtml(ev.price)}</span>` : ''}
        </div>
        <div class="text-muted" style="font-size:0.75rem; margin-top:2px;">
          ${dateLabel}${timeLabel ? ' · ' + escapeHtml(timeLabel) : ''}${ev.venue ? ' · ' + escapeHtml(ev.venue) : ''}
        </div>
        ${ev.district ? `<div class="text-muted" style="font-size:0.7rem;">${escapeHtml(ev.district)}</div>` : ''}
        ${formatEventAddress(ev) ? `<div class="text-muted" style="font-size:0.7rem; margin-top:2px;">📍 ${escapeHtml(formatEventAddress(ev))}</div>` : ''}
        ${ev.description ? `<div class="text-secondary" style="font-size:0.75rem; margin-top:6px; line-height:1.4;">${escapeHtml(truncateText(ev.description, 160))}</div>` : ''}
        ${ev.publicTransportHint ? `<div style="font-size:0.7rem; margin-top:4px;">🚆 ${escapeHtml(ev.publicTransportHint)}</div>` : ''}
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.4rem;">
          ${routeButton}
          ${ev.link ? `<a href="${escapeHtml(ev.link)}" target="_blank" rel="noopener" class="pill-btn" style="text-decoration:none;">Mehr erfahren ↗</a>` : ''}
        </div>
        ${disruptionWarning}
      </div>
    `;
  }).join('');
}

// Some city events (e.g. Bauleitplanung-Bekanntmachungen) name a subject
// location in the title ("... in Köln-Ehrenfeld") that differs from the
// actual venue address (e.g. a Stadtplanungsamt office elsewhere) - the
// route button targets the real venue coordinates, so the address is
// shown explicitly next to it instead of leaving that mismatch unexplained.
function formatEventAddress(ev) {
  const streetPart = ev.street ? `${ev.street}${ev.houseNumber ? ' ' + ev.houseNumber : ''}` : '';
  const cityPart = [ev.zip, ev.city].filter(Boolean).join(' ');
  return [streetPart, cityPart].filter(Boolean).join(', ');
}

// Turns "in wie viel Zeit beginnt das?" into a short live label instead of
// just repeating the date - real value computed from ev.startIso, never
// a fabricated/rounded guess.
function formatEventCountdown(startIso) {
  const diffMs = new Date(startIso).getTime() - Date.now();
  if (diffMs <= 0) return 'Läuft jetzt';
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `in ${diffMin} Min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 48) return `in ${diffH} Std`;
  return `in ${Math.round(diffH / 24)} Tagen`;
}

// Home tab: one curated hero card for the very next event plus 2 more
// compact rows - never the full 163-event wall, so the landing screen
// stays a "welcome", not another data dump.
function renderHomeEventPreview(events) {
  const heroEl = document.getElementById('home-events-hero');
  const moreEl = document.getElementById('home-events-more');
  if (!heroEl || !moreEl) return;

  if (events.length === 0) {
    heroEl.innerHTML = `<div class="glass-panel text-center py-6 text-muted">Veranstaltungen derzeit nicht verfügbar.</div>`;
    moreEl.innerHTML = '';
    return;
  }

  const [hero, ...rest] = events;
  const heroStart = new Date(hero.startIso);
  const heroDateLabel = heroStart.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const heroRouteButton = hero.nearestStation
    ? `<button class="pill-btn" data-route-to-station="${escapeHtml(hero.nearestStation.name)}">➔ Route ab ${escapeHtml(hero.nearestStation.short)} (${hero.nearestStation.distanceMeters}m)</button>`
    : '';
  const heroLink = hero.link
    ? `<a href="${escapeHtml(hero.link)}" target="_blank" rel="noopener" class="pill-btn" style="text-decoration:none;">Mehr erfahren ↗</a>`
    : '';

  heroEl.innerHTML = `
    <div class="home-event-hero" style="${hero.teaserImage ? `background-image:url('${hero.teaserImage.replace(/'/g, '%27')}');` : ''}">
      <div class="home-event-hero-body">
        <span class="home-event-countdown">${escapeHtml(formatEventCountdown(hero.startIso))}</span>
        <div style="font-weight:700; font-size:0.95rem;">${escapeHtml(hero.title)}</div>
        <div class="text-muted" style="font-size:0.75rem; margin-top:2px;">
          ${heroDateLabel}${hero.time ? ' · ' + escapeHtml(hero.time) : ''}${hero.venue ? ' · ' + escapeHtml(hero.venue) : ''}
        </div>
        ${formatEventAddress(hero) ? `<div class="text-muted" style="font-size:0.7rem;">📍 ${escapeHtml(formatEventAddress(hero))}</div>` : ''}
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.4rem;">
          ${heroRouteButton}
          ${heroLink}
        </div>
      </div>
    </div>
  `;

  moreEl.innerHTML = rest.slice(0, 2).map(ev => {
    const start = new Date(ev.startIso);
    const dateLabel = start.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    return `
      <div class="bento-card mb-2" style="padding:0.6rem 0.75rem;">
        <div style="font-weight:700; font-size:0.8rem;">${escapeHtml(ev.title)}</div>
        <div class="text-muted" style="font-size:0.7rem; margin-top:2px;">
          ${dateLabel}${ev.venue ? ' · ' + escapeHtml(ev.venue) : ''}
        </div>
      </div>
    `;
  }).join('');
}

function initHomeView() {
  wireEventRouteButtons(document.getElementById('home-events-hero'));
  wireEventRouteButtons(document.getElementById('home-events-more'));

  const fromInput = document.getElementById('home-from-input');
  const toInput = document.getElementById('home-to-input');
  const fromAutocomplete = document.getElementById('home-from-autocomplete');
  const toAutocomplete = document.getElementById('home-to-autocomplete');
  if (fromAutocomplete) setupAutocomplete(fromInput, fromAutocomplete, () => {});
  if (toAutocomplete) setupAutocomplete(toInput, toAutocomplete, () => {});

  const calcBtn = document.getElementById('home-calculate-route-btn');
  if (calcBtn) {
    calcBtn.addEventListener('click', () => {
      const from = fromInput.value.trim();
      const to = toInput.value.trim();
      if (!from || !to) return;
      switchTab('routes');
      document.getElementById('route-from-input').value = from;
      document.getElementById('route-to-input').value = to;
      calculateRoute(from, to);
    });
  }

  const allEventsBtn = document.getElementById('home-all-events-btn');
  if (allEventsBtn) {
    allEventsBtn.addEventListener('click', () => switchTab('events'));
  }
}

// Home tab: fills the space next to the map preview / weather pill with
// real, already-loaded Betriebslage data instead of leaving it empty -
// no extra fetch, `lines` is the same array loadDisruptions() already has.
function renderHomeDisruptionsSummary(lines) {
  const badgeEl = document.getElementById('home-disruptions-status-badge');
  const listEl = document.getElementById('home-disruptions-list');
  if (!listEl) return;

  if (badgeEl) setSlotHtml('home-disruptions-status-badge', renderDataStatus('disruptions'));

  if (!lines) {
    listEl.innerHTML = `<div class="text-muted" style="font-size:0.75rem;">Betriebslage derzeit nicht verfügbar.</div>`;
    return;
  }

  const affected = lines.filter(l => l.status && l.status !== 'green');
  if (affected.length === 0) {
    listEl.innerHTML = `<div class="text-muted" style="font-size:0.8rem;">Alle Linien fahren planmäßig.</div>`;
    return;
  }

  listEl.innerHTML = affected.slice(0, 6).map(l => `
    <div style="display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0; border-bottom:1px solid var(--border-subtle);">
      <span class="line-badge" style="background:${l.lineColor || (l.status === 'red' ? '#f43f5e' : '#f59e0b')}; color:${l.lineTextColor || '#05070a'};">${escapeHtml(String(l.id))}</span>
      <span style="font-size:0.75rem; color:var(--text-secondary);">${l.status === 'red' ? 'Störung' : 'Beeinträchtigt'}${l.hasSEV ? ' · Ersatzverkehr' : ''}</span>
    </div>
  `).join('');
}

async function loadDisruptions(force = false) {
  const store = await normalizeApiFetch('disruptions', '/api/disruptions', { force, freshnessWindow: 20000 });
  setSlotHtml('disruptions-status-badge', renderDataStatus(store));

  if (store.status === 'LIVE' || store.status === 'STALE') {
    state.disruptions = store.data;

    const lines = state.disruptions?.lines || [];
    const stadtbahnLines = lines.filter(l => l.type === 'stadtbahn');
    const sbNormalCount = stadtbahnLines.filter(l => l.status === 'green').length;
    const totalAlertLines = lines.filter(l => l.status !== 'green');
    const sevCount = lines.filter(l => l.hasSEV).length;

    // Update Telemetry Bento
    const sbNormalEl = document.getElementById('disrupt-sb-normal');
    if (sbNormalEl) sbNormalEl.textContent = `${sbNormalCount}/${stadtbahnLines.length || 12}`;

    const totalAlertsEl = document.getElementById('disrupt-total-alerts');
    if (totalAlertsEl) totalAlertsEl.textContent = `${totalAlertLines.length}`;

    const sevCountEl = document.getElementById('disrupt-sev-count');
    if (sevCountEl) sevCountEl.textContent = `${sevCount}`;

    const filterCountEl = document.getElementById('disrupt-filter-count');
    if (filterCountEl) filterCountEl.textContent = `${totalAlertLines.length}`;

    const badge = document.getElementById('disruption-badge');
    if (badge) {
      if (totalAlertLines.length > 0) {
        badge.textContent = `${totalAlertLines.length} AKTIV`;
        badge.className = 'dock-badge-alert';
        badge.style.background = 'rgba(244, 63, 94, 0.2)';
        badge.style.color = '#f43f5e';
      } else {
        badge.textContent = 'NORMAL';
        badge.className = 'dock-badge-alert';
        badge.style.background = 'rgba(16, 185, 129, 0.2)';
        badge.style.color = '#10b981';
      }
    }

    renderDisruptionsGrid();
    renderHomeDisruptionsSummary(lines);
  } else {
    renderHomeDisruptionsSummary(null);
    const sbNormalEl = document.getElementById('disrupt-sb-normal');
    if (sbNormalEl) sbNormalEl.textContent = '--';
    const totalAlertsEl = document.getElementById('disrupt-total-alerts');
    if (totalAlertsEl) totalAlertsEl.textContent = '--';
    const sevCountEl = document.getElementById('disrupt-sev-count');
    if (sevCountEl) sevCountEl.textContent = '--';

    const container = document.getElementById('stadtbahn-status-grid');
    if (container && !state.disruptions) {
      container.innerHTML = `
        <div class="glass-panel p-4 text-center text-rose">
          <div style="font-size:1.5rem; margin-bottom:0.4rem;">⛔</div>
          <div style="font-weight:700;">Betriebslage-Daten nicht verfügbar</div>
          <div class="text-muted mt-1" style="font-size:0.75rem;">${escapeHtml(store.error || 'Fehler beim Laden')}</div>
        </div>
      `;
    }
  }
}

function renderDisruptionsGrid() {
  const container = document.getElementById('stadtbahn-status-grid');
  if (!container || !state.disruptions) return;

  const allLines = state.disruptions.lines || [];
  const filter = state.disruptFilter || 'all';

  let filtered = allLines;
  if (filter === 'alerts') {
    filtered = allLines.filter(l => l.status !== 'green');
  } else if (filter === 'stadtbahn') {
    filtered = allLines.filter(l => l.type === 'stadtbahn');
  } else if (filter === 'bus') {
    filtered = allLines.filter(l => l.type !== 'stadtbahn');
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="glass-panel p-4 text-center">
        <div style="font-size:1.8rem; margin-bottom:0.5rem;">🎉</div>
        <div style="font-weight:800; color:var(--vexto-emerald);">Keine aktuellen Störungen</div>
        <div class="text-muted mt-1" style="font-size:0.75rem;">Alle Linien im regulären Fahrplanbetrieb.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(l => {
    const isSb = l.type === 'stadtbahn';
    const termini = isSb ? (STADTBAHN_TERMINI[l.id] || '') : (l.termini || '');
    const isGreen = l.status === 'green';
    const isRed = l.status === 'red' || l.hasSEV;
    const badgeStatus = isGreen ? 'green' : (isRed ? 'red' : 'yellow');
    const badgeLabel = isGreen ? 'PÜNKTLICH' : (l.hasSEV ? 'SEV' : (l.status === 'red' ? 'SPERRUNG' : 'WARNUNG'));
    
    let statusText = '● Normalbetrieb (Keine Störungen)';
    if (l.hasSEV) statusText = '🚨 Schienenersatzverkehr (SEV) aktiv';
    else if (l.status === 'red') statusText = '⛔ Streckensperrung gemeldet';
    else if (l.status === 'yellow') statusText = '⚠️ Baustelle / Behinderung';

    const cleanDesc = l.description ? escapeHtml(l.description) : '';

    return `
      <div class="disruption-card status-${badgeStatus}" onclick="window.appOpenDisruption('${escapeHtml(l.id)}')">
        <div class="dcard-header">
          <div class="dcard-left">
            <span class="line-badge" style="background:${l.lineColor || '#00f0ff'}; color:${l.lineTextColor || '#fff'};">${escapeHtml(l.id)}</span>
            <div class="dcard-title-col">
              <div class="dcard-title">
                <span>${escapeHtml(l.name || ('Linie ' + l.id))}</span>
                ${termini ? `<span class="dcard-termini">${escapeHtml(termini)}</span>` : ''}
              </div>
              <div class="dcard-status-text text-${isGreen ? 'emerald' : (isRed ? 'rose' : 'amber')}">
                ${statusText}
              </div>
            </div>
          </div>
          <div class="dcard-status-badge ${badgeStatus}">
            ${badgeLabel}
          </div>
        </div>
        ${!isGreen && cleanDesc ? `
          <div class="dcard-body">
            <div class="dcard-desc">${cleanDesc}</div>
            ${l.reports && l.reports.length > 1 ? `<div class="dcard-sub-count">+ ${l.reports.length - 1} weitere Meldungen</div>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

window.appOpenDisruption = function(lineId) {
  const l = state.disruptions?.lines?.find(x => x.id === lineId || x.name === lineId);
  if (!l) return;

  const modal = document.getElementById('disruption-modal');
  if (!modal) return;

  const badgeEl = document.getElementById('disrupt-modal-badge');
  if (badgeEl) {
    badgeEl.textContent = l.id;
    badgeEl.style.background = l.lineColor || '#00f0ff';
    badgeEl.style.color = l.lineTextColor || '#fff';
  }

  const titleEl = document.getElementById('modal-title');
  if (titleEl) titleEl.textContent = `Betriebslage ${l.name || ('Linie ' + l.id)}`;

  const subEl = document.getElementById('disrupt-modal-sub');
  if (subEl) {
    const termini = STADTBAHN_TERMINI[l.id] || '';
    subEl.textContent = termini ? `${termini} • KVB Köln` : 'Netz Köln';
  }

  const reports = l.reports && l.reports.length > 0 ? l.reports : [{
    title: l.name,
    description: l.description || 'Fahrplanmäßiger Betrieb ohne bekannte Störungen.',
    status: l.status,
    hasSEV: l.hasSEV,
    timestamp: new Date().toISOString()
  }];

  const bodyEl = document.getElementById('modal-body');
  if (bodyEl) {
    bodyEl.innerHTML = reports.map((r, idx) => `
      <div class="glass-panel p-3 mb-2" style="background:rgba(255,255,255,0.03); border-radius:10px; border:1px solid rgba(255,255,255,0.08);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:0.75rem; font-weight:800; color:${r.status === 'green' ? 'var(--vexto-emerald)' : (r.status === 'red' ? 'var(--vexto-rose)' : 'var(--vexto-amber)')};">
            ${r.hasSEV ? '🚨 Schienenersatzverkehr (SEV)' : (r.status === 'green' ? '✓ Normalbetrieb' : '⚠️ Betriebsstörung')}
          </span>
          <span class="mono text-muted" style="font-size:0.65rem;">Meldung ${idx + 1}/${reports.length}</span>
        </div>
        <p style="font-size:0.82rem; line-height:1.55; color:var(--text-primary); margin:0;">
          ${escapeHtml(r.description || '')}
        </p>
      </div>
    `).join('');
  }

  const highlightBtn = document.getElementById('disrupt-modal-highlight-btn');
  if (highlightBtn) {
    highlightBtn.onclick = () => {
      modal.style.display = 'none';
      switchTab('map');
      const track = state.lineTracks?.find(t => t.line === l.id);
      if (track) highlightLineTrack(track);
    };
  }

  modal.style.display = 'flex';
};

// ==========================================================================
// 17. Cologne Widgets (Tab 8)
// ==========================================================================
// Home tab's compact weather card, fed from the same real weather field
// the Widgets tab already displays (state.dataStores.widgets_weather /
// w) - no separate fetch, just a second render target.
function updateHomeWeatherCard(w) {
  const iconEl = document.getElementById('home-weather-icon');
  const tempEl = document.getElementById('home-weather-temp');
  const condEl = document.getElementById('home-weather-cond');
  if (!iconEl || !tempEl || !condEl) return;

  if (w && typeof w.temp === 'number') {
    iconEl.textContent = w.icon || '🌤️';
    tempEl.textContent = `${Math.round(w.temp)}°C`;
    condEl.textContent = w.condition
      ? `Köln · ${w.condition}${typeof w.rainProbNow === 'number' ? ` · ${w.rainProbNow}% Regen` : ''}`
      : 'Köln';
  } else {
    iconEl.textContent = '--';
    tempEl.textContent = '--°C';
    condEl.textContent = 'Wetter derzeit nicht verfügbar';
  }
}

async function loadWidgets(force = false) {
  const store = await normalizeApiFetch('widgets', '/api/widgets', { force, freshnessWindow: 30000 });

  const p = store.data?.pegel;
  const w = store.data?.weather;
  const pk = store.data?.parking;

  // Keep the per-field sub-stores (widgets_pegel/widgets_weather/widgets_parking)
  // in sync with the combined payload so each widget gets its own LIVE/STALE/
  // UNAVAILABLE/ERROR badge instead of collapsing into the parent's status.
  syncWidgetSubStore('widgets_pegel', p, store);
  syncWidgetSubStore('widgets_weather', w, store);
  syncWidgetSubStore('widgets_parking', pk, store);

  setSlotHtml('pegel-status-badge', renderDataStatus('widgets_pegel'));
  setSlotHtml('weather-status-badge', renderDataStatus('widgets_weather'));
  setSlotHtml('parking-status-badge', renderDataStatus('widgets_parking'));

  if (store.status === 'LIVE' || store.status === 'STALE') {
    state.widgets = store.data;

    // 1. Pegel
    const pegelValEl = document.getElementById('pegel-cm-val');
    const headerPegel = document.getElementById('header-pegel-val');
    const pegelTrendBadge = document.getElementById('pegel-trend-badge');

    if (p && (p.status === 'live' || p.status === 'stale') && (typeof p.valueCm === 'number' || typeof p.value === 'number')) {
      const val = p.valueCm ?? p.value;
      if (pegelValEl) pegelValEl.textContent = val;
      if (headerPegel) headerPegel.textContent = `${val} cm`;
      if (pegelTrendBadge) pegelTrendBadge.textContent = p.statusText || 'Normal';
    } else {
      if (pegelValEl) pegelValEl.textContent = '--';
      if (headerPegel) headerPegel.textContent = '--';
      if (pegelTrendBadge) pegelTrendBadge.textContent = 'Nicht verfügbar';
    }

    // 2. Weather
    const tempValEl = document.getElementById('weather-temp-val');
    const headerW = document.getElementById('header-weather-val');
    const condEl = document.getElementById('weather-cond-text');

    if (w && (w.status === 'live' || w.status === 'stale') && typeof w.temp === 'number') {
      const rounded = Math.round(w.temp);
      if (tempValEl) tempValEl.textContent = `${rounded}°C`;
      if (headerW) headerW.textContent = `${rounded}°C`;
      if (condEl) condEl.textContent = w.condition || 'Köln';
      updateHomeWeatherCard(w);
    } else {
      if (tempValEl) tempValEl.textContent = '--';
      if (headerW) headerW.textContent = '--';
      if (condEl) condEl.textContent = 'Nicht verfügbar';
      updateHomeWeatherCard(null);
    }

    // 3. Parking
    const freeEl = document.getElementById('parking-total-free');
    if (pk && (pk.status === 'live' || pk.status === 'stale') && typeof pk.totalFree === 'number') {
      if (freeEl) freeEl.textContent = pk.totalFree.toLocaleString('de-DE');
    } else {
      if (freeEl) freeEl.textContent = '--';
    }

    renderParkingMarkers(pk?.garages || []);
    renderPegelMarker(p);
  } else {
    // Error / Unavailable
    const pegelValEl = document.getElementById('pegel-cm-val');
    if (pegelValEl) pegelValEl.textContent = '--';
    const headerPegel = document.getElementById('header-pegel-val');
    if (headerPegel) headerPegel.textContent = '--';

    const tempValEl = document.getElementById('weather-temp-val');
    if (tempValEl) tempValEl.textContent = '--';
    const headerW = document.getElementById('header-weather-val');
    if (headerW) headerW.textContent = '--';
    updateHomeWeatherCard(null);

    const freeEl = document.getElementById('parking-total-free');
    if (freeEl) freeEl.textContent = '--';

    if (state.parkingMarkersGroup) state.parkingMarkersGroup.clearLayers();
    if (state.pegelGroup) state.pegelGroup.clearLayers();
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
  const ok = executeMapAction(action);
  if (!ok && action?.type === 'route') {
    // Silent-failure fix (Schritt 4): the button click previously did
    // nothing visible when geometry couldn't be resolved.
    const warning = '⚠ Diese Route kann derzeit nicht auf der Karte dargestellt werden (keine Streckengeometrie gefunden).';
    const floatingPanelOpen = document.getElementById('map-ai-panel')?.style.display === 'flex';
    if (floatingPanelOpen) {
      appendFloatingAiMessage('bot', warning);
    } else {
      appendChatMessage('assistant', warning);
    }
  }
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
        if (data.mapAction) {
          const ok = executeMapAction(data.mapAction);
          if (!ok && data.mapAction.type === 'route') {
            appendFloatingAiMessage('bot', '⚠ Diese Route kann derzeit nicht auf der Karte dargestellt werden (keine Streckengeometrie gefunden).');
          }
        }
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
  if (!action || !state.map) return false;

  if (action.type === 'route' && action.start && action.end) {
    return plotRouteTrackOnMap({
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
    return true;
  }
  return false;
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

function truncateText(str, maxLen) {
  if (!str) return '';
  const s = String(str).trim();
  return s.length > maxLen ? s.slice(0, maxLen).trimEnd() + '…' : s;
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
