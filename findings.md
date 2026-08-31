# Findings & Technical Discoveries: Köln Live-Monitor

## 1. Map Tiles & Watermark Elimination
- **Issue:** CartoDB (`cartocdn.com/dark_all`) now prints an `"API KEY REQUIRED"` watermark on all tiles when loaded without an API key from custom localhost/domains.
- **Solution:** 
  - **Dark Mode:** `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}` (Esri Dark Canvas - 100% free, crisp, high contrast, zero watermark).
  - **Light Mode:** `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` (OpenStreetMap standard).
  - **Satellite / GPS View:** `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` + Reference labels: `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`.

## 2. Cologne Geofencing & Zoom Constraints
- **Bounds:** Greater Cologne area `[[50.65, 6.60], [51.25, 7.35]]`.
- **Zoom Limit:** `minZoom: 11` ensures users never zoom out beyond Cologne/Bonn/Leverkusen, maintaining optimal map detail and performance.

## 3. Real-Time Emergency Feeds (Polizei Köln & Feuerwehr Köln)
- **Official RSS Stream:** `https://www.presseportal.de/rss/dienststelle_12415.rss2` (Polizei Köln Dienststelle 12415).
- **Incident Types:** Robbery, shootings, accidents, traffic jams, fire rescue support, missing persons, large-scale police operations.
- **Georeferencing Engine:** 49+ recognized Cologne quarters (Vingst, Kalk, Mülheim, Ehrenfeld, Altstadt, Nippes, Chorweiler, Porz, Rodenkirchen, Autobahnen A1/A3/A4/A57, etc.) mapped directly to GPS coordinates.
