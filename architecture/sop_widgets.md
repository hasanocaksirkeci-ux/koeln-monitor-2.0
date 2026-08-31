# Standard Operating Procedure (SOP): Cologne Live Widgets

## 1. Objective
Aggregate real-time environmental and urban metrics for Cologne (Rhein water level, city parking garages, and weather forecast) without API keys.

## 2. Endpoints & Integrations
- **Rheinpegel (WSV PegelOnline):**
  - URL: `https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/a6ee8177-107b-47dd-bcfd-30960ccc6e9c/W/`
  - Current value (`/currentmeasurement.json`) & 3h history (`/measurements.json?hours=3`) to calculate 3-hour trend (rising, falling, steady).
  - Flood indicators: Marke I (620 cm), Marke II (830 cm).
- **Parkhäuser (Stadt Köln Open Data):**
  - URL: `https://www.stadt-koeln.de/externe-dienste/open-data/parking.php`
  - Parse ESRI feature JSON, clean null/closed entries, calculate total capacity and availability percentages.
  - Categorize by city quarters (Dom/Hbf, Neumarkt, Ringe, Deutz/Kalk, Ehrenfeld/Stadion).
- **Wetter Köln (Open-Meteo):**
  - Lat: 50.9375, Lon: 6.9603
  - Current temperature, condition code, wind speed, humidity, 6-hour precipitation probability.

## 3. Cache Policy
- In-memory cache for 3 minutes (`180000ms`).
