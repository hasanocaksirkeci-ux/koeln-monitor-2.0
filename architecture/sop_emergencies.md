# SOP: Polizei & Feuerwehr Köln Live-Einsätze (Blaulicht-Monitor)

## Goal
Scrape, geocode, categorize, and archive official emergency incident reports for the City of Cologne from the official police press room (`Presseportal Polizeipräsidium Köln`) and NINA Katastrophenschutz.

## Inputs
- RSS URL: `https://www.presseportal.de/rss/dienststelle_12415.rss2`
- Geocoding mapping: `DISTRICT_COORDS` with 50+ Cologne Veedel and motorways.

## Output Payload (`/api/emergencies`)
```json
{
  "timestamp": "ISO-8601",
  "count": 20,
  "emergencies": [
    {
      "id": "string",
      "source": "Polizei Köln",
      "category": "police | fire | accident | critical",
      "title": "string",
      "district": "string",
      "lat": 50.9350,
      "lng": 7.0120,
      "pubDate": "ISO-8601",
      "timeAgo": "vor 2 Std.",
      "description": "string",
      "link": "https://...",
      "isCritical": false
    }
  ]
}
```

## Resilience & Caching
- Cache TTL: 60 seconds in memory.
- Persistence: All scraped incidents are stored in `data/koeln_monitor.sqlite` so historical events remain queryable via full-text search.
