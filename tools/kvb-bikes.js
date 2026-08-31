let bikesCache = {
  data: null,
  timestamp: 0
};

const CACHE_TTL_MS = 60 * 1000; // 60s

export async function fetchKvbBikes() {
  const now = Date.now();
  if (bikesCache.data && (now - bikesCache.timestamp) < CACHE_TTL_MS) {
    return bikesCache.data;
  }

  try {
    const res = await fetch('https://api.nextbike.net/maps/nextbike-live.json?city=14', {
      headers: { 'User-Agent': 'KoelnLiveMonitor/2.0' }
    });

    if (!res.ok) {
      throw new Error(`Nextbike API HTTP ${res.status}`);
    }

    const json = await res.json();
    const city = json.countries?.[0]?.cities?.[0];
    const rawPlaces = city?.places || [];

    let totalAvailableBikes = 0;
    const stations = [];

    for (const p of rawPlaces) {
      const available = p.bikes_available_to_rent || p.bikes || 0;
      totalAvailableBikes += available;

      // Filter active places with valid coordinates in Cologne bounds
      if (p.lat && p.lng && p.lat > 50.75 && p.lat < 51.15 && p.lng > 6.70 && p.lng < 7.25) {
        stations.push({
          id: p.uid || p.number,
          name: p.name || 'KVB Rad Station',
          lat: p.lat,
          lng: p.lng,
          availableBikes: available,
          bikeRacks: p.bike_racks || 0,
          freeRacks: p.free_racks || 0,
          isSpot: p.spot === true
        });
      }
    }

    const payload = {
      timestamp: new Date().toISOString(),
      totalStations: stations.length,
      totalAvailableBikes,
      stations: stations.slice(0, 350) // Top/Dense stations for optimal map render performance
    };

    bikesCache = {
      data: payload,
      timestamp: now
    };

    return payload;
  } catch (err) {
    console.error('Error fetching KVB bikes:', err.message);
    if (bikesCache.data) return bikesCache.data;
    return {
      timestamp: new Date().toISOString(),
      totalStations: 0,
      totalAvailableBikes: 0,
      stations: [],
      error: err.message
    };
  }
}

export default {
  fetchKvbBikes
};
