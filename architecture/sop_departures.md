# Standard Operating Procedure (SOP): KVB Live Departures

## 1. Objective
Retrieve, enrich, and deliver real-time public transport departures for any station in Cologne (Stadtbahn, S-Bahn, Regionalbahn, Bus) with zero latency overhead.

## 2. Source & Protocol
- **Service:** KVB HAFAS Mobile Endpoint via `hafas-client/p/kvb`
- **SSL Requirements:** Thawte RSA + DigiCert Global Root G2 CA chain (handled in `tools/kvb-client.js`).
- **Endpoint:** `GET /api/departures?stopId={id}`

## 3. Data Processing & Rules
1. **Station ID Resolution:** Accepts 9-digit KVB/VRS stop IDs (e.g., `900000002` for Neumarkt).
2. **Product Color Assignment:**
   - Stadtbahn:
     - 1: `#E3000F`
     - 3: `#95237C`
     - 4: `#E5007D`
     - 5: `#0098A6`
     - 7: `#EA5B0C`
     - 9: `#792348`
     - 12: `#48671E`
     - 13: `#A17A24`
     - 15: `#006C35`
     - 16: `#00958F`
     - 17: `#8DB824`
     - 18: `#009EE0`
   - S-Bahn: `#008A51`
   - Regionalverkehr (RE/RB): `#D4001F`
   - Bus: `#E3000F` (Darker crimson badge)
3. **Delay & Realtime Calculation:**
   - Delay in minutes: `Math.round((when - plannedWhen) / 60000)`
   - Minutes countdown: `Math.max(0, Math.round((when - now) / 60000))`
   - Real-time indicator flag: `when !== null` vs schedule fallback.
4. **Caching:** 10-second in-memory cache per `stopId` to prevent downstream rate-limiting during client bursts.
