# Project Constitution: Köln Live-Monitor & City-Platform

> **B.L.A.S.T. / A.N.T. Project Standard**
> `GEMINI.md` is law. The planning files are memory.

---

## 🎯 1. North Star & Core Goal

- **Singular Desired Outcome:** Eine blitzschnelle, professionelle 2D/3D Live-City-Plattform für Köln mit 100% echten Live-Daten, nativer SQLite-Datenbank und vollständiger Mobilitäts- & Sicherheitsüberwachung:
  - **KVB Live-Radar:** ~300 Bahnen & Busse in Echtzeit mit Flightradar-Features (3D-Cockpit-Follow-Kamera, Live-Tachometer km/h, Strecken-Highlighting).
  - **Blaulicht & Polizei/Feuerwehr Live-Radar:** Offizielle Einsatzmeldungen mit Veedel-Geocoding, Sirenen-Pins auf der Karte und durchsuchbarem Einsatzarchiv.
  - **KVB Rad & Nextbike:** 1.947 Stationen und Leihräder in Köln mit Live-Verfügbarkeit.
  - **Karten-Ansichten ohne API-Key:** Esri Dark Canvas, OpenStreetMap, Esri World Imagery (High-Res Satellit/GPS) und 3D-Drohnen-Neigung (28° Tilt).
  - **GPS Live-Tracking:** Standort-Ortung mit Genauigkeitskreis.
  - **Geofencing & Zoom-Limits:** `minZoom: 11`, `maxBounds` fixiert auf Großraum Köln/Rheinland.
  - **Netz-Pünktlichkeit & Analytics:** Erfassung von Verspätungen und Pünktlichkeits-Score in SQLite.
  - **Routenplaner, Störungen & SEV, Rheinpegel, Parkleitsystem und Wetter.**

---

## 🔌 2. Integrations & Source of Truth

- **KVB Live-Radar & HAFAS:** KVB HAFAS `radar()` für 300+ Live-Fahrzeuge & `journeys()` für Routen.
- **KVB Haltestellen:** HAFAS KVB Profile (`auskunft.kvb.koeln/gate`) via `hafas-client` mit verifizierter Haltestellendatenbank (`tools/verified_stations.json`, Florastr. ID `900000304`).
- **Polizei & Feuerwehr Köln Live-Einsätze:** Presseportal Polizei Köln (`https://www.presseportal.de/rss/dienststelle_12415.rss2`) mit 49+ Veedel-Koordinaten.
- **KVB Rad / Nextbike:** Offizieller GBFS / Live-JSON Feed (`https://api.nextbike.net/maps/nextbike-live.json?city=14`).
- **KVB Störungsmeldungen:** Offizielle KVB-Betriebslage (`https://www.kvb.koeln/fahrtinfo/betriebslage/index.html`).
- **Rhein-Pegelstand:** WSV PegelOnline REST-API (`https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/a6ee8177-107b-47dd-bcfd-30960ccc6e9c/W/`).
- **Parkhausbelegung:** Stadt Köln Open Data Live-Schnittstelle (`https://www.stadt-koeln.de/externe-dienste/open-data/parking.php`).
- **Wetter Köln:** Open-Meteo Forecast API (`https://api.open-meteo.com/v1/forecast`).
- **Persistente Datenbank:** Native `node:sqlite` (`data/koeln_monitor.sqlite`).

---

## 📐 3. Data-First Schemas

### 3.1 Live Emergencies Payload (`/api/emergencies`)

```json
{
  "timestamp": "2026-08-26T18:40:00+02:00",
  "count": 15,
  "emergencies": [
    {
      "id": "pol-260826-1",
      "source": "Polizei Köln",
      "category": "police",
      "title": "Schüsse auf ein Mehrfamilienhaus in Köln-Vingst",
      "district": "Vingst",
      "lat": 50.9350,
      "lng": 7.0120,
      "pubDate": "2026-08-26T13:03:15+02:00",
      "timeAgo": "vor 5 Std.",
      "description": "Nach Schüssen auf ein Mehrfamilienhaus...",
      "link": "https://www.presseportal.de/blaulicht/pm/12415/...",
      "isCritical": true
    }
  ]
}
```

### 3.2 KVB Rad / Nextbike Payload (`/api/bikes`)

```json
{
  "timestamp": "2026-08-26T18:40:00+02:00",
  "totalStations": 1947,
  "totalAvailableBikes": 1420,
  "stations": [
    {
      "id": 430479,
      "name": "KVB Hauptverwaltung",
      "lat": 50.938831,
      "lng": 6.90627,
      "availableBikes": 5,
      "bikeRacks": 8,
      "freeRacks": 3
    }
  ]
}
```

### 3.3 Analytics & Punctuality Payload (`/api/analytics`)

```json
{
  "timestamp": "2026-08-26T18:40:00+02:00",
  "punctualityScore": 91.5,
  "totalTracked": 305,
  "onTimeCount": 279,
  "delayedCount": 26,
  "averageDelayMinutes": 1.2,
  "linePerformance": [
    {
      "line": "12",
      "punctuality": 94.2,
      "activeVehicles": 18,
      "averageDelay": 0.8
    }
  ]
}
```

---

## 🛡️ 4. Behavioral Rules & Constraints ("Do Not" Rules)

1. **Keine CartoDB Wasserzeichen:** Keine `API KEY REQUIRED` Wasserzeichen. Nur freie, unbegrenzte Tiles (Esri Dark Canvas, OpenStreetMap, Esri Satellit).
2. **Kartenbegrenzung (Geofencing):** `minZoom: 11` und `maxBounds` arretiert auf Köln/Rheinland.
3. **100% Real Live-Data:** Alle Daten (KVB Radar, Polizei Köln, Nextbike, Störungen, Pegel, Parken) stammen aus echten Live-APIs.
4. **Resiliente Datenbank:** Native `node:sqlite` wird deterministisch initialisiert und speichert alle historischen Daten in `data/koeln_monitor.sqlite`.
