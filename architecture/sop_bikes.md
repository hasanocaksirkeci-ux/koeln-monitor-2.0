# SOP: KVB Rad / Nextbike Live-Tracking

## Goal
Fetch real-time bike sharing station locations, available rental bikes, and bike dock capacities across Cologne.

## Inputs
- Nextbike Cologne Live API: `https://api.nextbike.net/maps/nextbike-live.json?city=14`

## Output Payload (`/api/bikes`)
```json
{
  "timestamp": "ISO-8601",
  "totalStations": 1957,
  "totalAvailableBikes": 2288,
  "stations": [
    {
      "id": 430479,
      "name": "KVB Hauptverwaltung",
      "lat": 50.938831,
      "lng": 6.90627,
      "availableBikes": 5,
      "bikeRacks": 8,
      "freeRacks": 3,
      "isSpot": true
    }
  ]
}
```

## Resilience & Caching
- Cache TTL: 60 seconds in memory.
- Geofencing: Stations filtered strictly within Cologne bounding box.
