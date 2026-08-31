# Standard Operating Procedure (SOP): KVB Live Disruptions & SEV

## 1. Objective
Scrape, decode, parse, and structure official KVB disruption notices, construction warnings, and SEV (Schienenersatzverkehr) replacement operations.

## 2. Source & Protocol
- **Source URL:** `https://www.kvb.koeln/fahrtinfo/betriebslage/index.html`
- **Charset:** `windows-1252` (must use `TextDecoder('windows-1252')` on binary array buffer to preserve German umlauts: ä, ö, ü, ß).
- **Endpoint:** `GET /api/disruptions`

## 3. Classification & Traffic Light Logic
1. **🟢 Green (Normalbetrieb):**
   - Lines with 0 active reported disruptions in the official feed.
2. **🟡 Yellow (Teilausfall / Verspätungen / Verlegte Haltestellen):**
   - Notices with keywords like "Verspätung", "verlegt", "Gleiswechsel", "Haltestellenausfall", "Verzögerung".
3. **🔴 Red (Streckensperrung / SEV):**
   - Notices containing "getrennt", "gesperrt", "Ersatzbus", "SEV", "Schienenersatzverkehr", "Ausfall", "Gleissperrung", "Bauarbeiten mit Unterbrechung".

## 4. Cache & Annunciation
- Cached for 60 seconds to avoid hitting KVB servers on every client reload.
- Full official announcement text (`<b>...</b>` and JSON-LD `SpecialAnnouncement`) preserved verbatim.
