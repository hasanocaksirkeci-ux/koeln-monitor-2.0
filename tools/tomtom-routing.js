/**
 * TomTom Geocoding & Routing Integration
 * Provides real street-level geometry for Auto/Rad/Fußgänger routing and
 * replaces the previously fabricated interpolation-curve fallback used
 * for KVB station pairs without a shared line (see stations-data.js).
 *
 * Reuses the same API key + Cologne bounding box as tools/tomtom-traffic.js
 * so we don't duplicate credentials/config.
 */

function getTomTomKey() {
  return (process.env.TOMTOM_API_KEY || 'aKtg58nDLybJblRnP0vff8Q81XaggPEM').trim();
}

// Bounding box for Greater Cologne (South-West to North-East) - same as tomtom-traffic.js
const COLOGNE_BBOX = '6.75,50.82,7.18,51.08'; // minLon,minLat,maxLon,maxLat

export function isTomTomRoutingConfigured() {
  const key = getTomTomKey();
  return Boolean(key && key !== '');
}

const VALID_MODES = new Set(['car', 'bicycle', 'pedestrian']);

/**
 * Resolve free-text place/address queries within Cologne to coordinates
 * using TomTom's Geocoding API. Returns null instead of guessing when no
 * good match exists - callers must not fabricate a location.
 */
export async function geocodePlace(query) {
  if (!query || !isTomTomRoutingConfigured()) return null;
  const key = getTomTomKey();

  try {
    const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json?key=${key}&limit=1&countrySet=DE&topLeft=${COLOGNE_BBOX.split(',')[1]},${COLOGNE_BBOX.split(',')[0]}&btmRight=${COLOGNE_BBOX.split(',')[3]},${COLOGNE_BBOX.split(',')[2]}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) throw new Error(`TomTom Geocoding responded with status ${response.status}`);

    const data = await response.json();
    const first = data.results && data.results[0];
    if (!first || !first.position) return null;

    return {
      lat: first.position.lat,
      lng: first.position.lon,
      label: first.address?.freeformAddress || query
    };
  } catch (err) {
    console.error('Error in TomTom geocodePlace:', err.message);
    return null;
  }
}

/**
 * Calculate a real, street-level route between two coordinates via the
 * TomTom Routing API. mode is one of 'car' | 'bicycle' | 'pedestrian'.
 * Returns null (never a fabricated line) if unconfigured or the API fails.
 */
export async function calculateDrivingRoute(fromCoord, toCoord, mode = 'car') {
  if (!fromCoord || !toCoord) return null;
  const travelMode = VALID_MODES.has(mode) ? mode : 'car';

  if (!isTomTomRoutingConfigured()) {
    return { status: 'unconfigured', configured: false, error: 'TomTom API-Key nicht konfiguriert' };
  }

  const key = getTomTomKey();
  const locations = `${fromCoord.lat},${fromCoord.lng}:${toCoord.lat},${toCoord.lng}`;

  try {
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${locations}/json?key=${key}&travelMode=${travelMode}&routeType=fastest&traffic=false`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`TomTom Routing responded with status ${response.status}`);

    const data = await response.json();
    const route = data.routes && data.routes[0];
    const leg = route?.legs && route.legs[0];
    const points = leg?.points;
    if (!route || !points || points.length < 2) {
      throw new Error('TomTom Routing lieferte keine brauchbare Streckengeometrie');
    }

    return {
      configured: true,
      mode: travelMode,
      coordinates: points.map(p => [p.latitude, p.longitude]),
      distanceMeters: route.summary?.lengthInMeters ?? null,
      durationSeconds: route.summary?.travelTimeInSeconds ?? null,
      source: 'tomtom-routing'
    };
  } catch (err) {
    console.error('Error in TomTom calculateDrivingRoute:', err.message);
    return { configured: true, error: err.message };
  }
}
