# 🚊 Köln Live-Monitor & City-Platform v2.0

> **Blitzschnelle, professionelle 2D/3D Live-City-Plattform für Köln mit 100% echten Daten, SQLite-Persistenz und vollständiger Mobilitäts- & Sicherheitsüberwachung.**

🌐 **Live-Deployment:** [https://koeln-live-monitor.vercel.app](https://koeln-live-monitor.vercel.app)

---

## ✨ Features & Module

### 🚊 1. KVB Live-Radar & ÖPNV
- **~300+ Live-Fahrzeuge:** Stadtbahnen und Busse in Echtzeit auf der Karte.
- **Flightradar-Modus:** 3D-Cockpit-Follow-Kamera, Live-Tachometer (km/h) und dynamische Streckenvorschau.
- **DFI-Abfahrtstafeln:** Minutengenaue Live-Abfahrten mit Gleisangaben und Verspätungsanzeige für alle Haltestellen.
- **15.000+ OSM Vektor-Trassen:** Präzise Schienen- und Buskorridor-Geometrien inklusive U-Bahn-Tunneln.

### 🚨 2. Blaulicht & Sicherheits-Monitor
- **Polizei & Feuerwehr Köln:** Offizielle Einsatzmeldungen direkt vom Presseportal.
- **Intelligentes Geocoding:** Automatische Zuordnung auf alle 86 Kölner Veedel, Straßen und Autobahnen.
- **Sirenen-Pins & Archiv:** Pulsierende Warn-Pins auf der Karte und durchsuchbares SQLite-Einsatzarchiv.

### 🚲 3. KVB-Rad / Nextbike Live-Tracking
- **2.000+ Stationen & Räder:** Echtzeit-Verfügbarkeit von Fahrrädern im gesamten Kölner Stadtgebiet.
- **Stations-Details:** Freie Räder, freie Docks und Stationstyp.

### 🗺️ 4. Multimodaler Routenplaner
- **ÖPNV & Individualverkehr:** KVB-Verbindungen sowie Auto-, Fahrrad- und Fußgänger-Navigation via TomTom Routing.
- **Trassen-Visualisierung:** Echte geroutete Geometrie direkt auf der Karte.

### 📊 5. City-Widgets & Analytics
- **WSV PegelOnline:** Rheinpegel Köln mit Trendkurve, 4h-Verlauf und Hochwassermarken.
- **Stadt Köln Parkleitsystem:** Live freie Stellplätze in 45+ Parkhäusern der Kölner City.
- **Open-Meteo Wetter:** Stundengenaue Wettervorhersage und Regenradar-Prognose.
- **TomTom Live-Verkehr:** Staus, Baustellen und Brückensperrungen in Echtzeit.
- **Pünktlichkeits-Score:** Kontinuierliche Netz-Pünktlichkeitsanalyse.

### 🤖 6. Köln AI City Concierge
- Intelligenter Verkehrs- und Stadt-Assistent angetrieben von Gemini 3.6 Flash / Ollama.

---

## 🛠️ Tech-Stack

- **Backend:** Node.js (ESM), Express, native `node:sqlite`, `hafas-client`
- **Frontend:** Vanilla JS, Modern CSS Tokens, Leaflet 1.9, Esri Dark Canvas & World Imagery
- **Deployment:** Vercel Serverless Lambdas

---

## 🚀 Schnellstart Lokal

### 1. Repository klonen & Abhängigkeiten installieren
```bash
git clone https://github.com/hasanocaksirkeci-ux/koeln-monitor-2.0.git
cd koeln-monitor-2.0
npm install
```

### 2. Umgebungsvariablen (.env)
Erstelle eine `.env`-Datei im Root-Verzeichnis:
```env
PORT=3000
TOMTOM_API_KEY=dein_tomtom_api_key
GEMINI_API_KEY=dein_gemini_api_key
```

### 3. Server starten
```bash
npm start
```
Die Plattform ist nun unter `http://localhost:3000` erreichbar.

---

## 🧪 Tests ausführen

```bash
# Concurrency & Request Lifecycle Tests
node tests/test_concurrency_lifecycle.js

# Data Integrity & Anti-Fake Tests
node tests/test_data_integrity.js

# Frontend Resilience & Normalization Tests
node tests/test_frontend_resilience.js
```

---

## 📄 Lizenz
MIT License. Real-Time Data provided by KVB Köln, Polizei Köln, WSV PegelOnline, Stadt Köln Open Data, Open-Meteo & TomTom.
