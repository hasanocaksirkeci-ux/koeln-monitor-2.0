/**
 * Köln Live-Monitor: Veranstaltungen der Stadt Köln
 * Quelle: Offene Daten Köln / stadt-koeln.de Open-Data-Schnittstelle
 * (gleiches Feed-Muster wie tools/cologne-widgets.js -> fetchParkingData)
 */

const EVENTS_URL = 'http://www.stadt-koeln.de/externe-dienste/open-data/events-od.php';

// The feed returns beginndatum/endedatum as plain "YYYY-MM-DD" (verified
// live against events-od.php); uhrzeit is a free-text range ("13 bis 15
// Uhr", often empty for multi-day events) rather than a parseable "HH:MM",
// so it's kept as a separate display string instead of being merged into
// the ISO timestamp. Returns null instead of guessing when malformed.
function parseIsoDate(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${dateStr}T00:00:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// The feed embeds raw "<br />" tags inside free-text fields (uhrzeit,
// oepnv, description). The frontend escapes all event text for safe
// display, which would otherwise turn those into literal visible
// "<br />" strings - normalize them into a plain-text separator instead.
function cleanText(v) {
  const s = (v || '').trim();
  if (!s) return null;
  return s.replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;
}

/**
 * Fetches upcoming Köln events. `ndays` mirrors the source API's own
 * lookahead parameter, `kat` its category filter (both passed through
 * verbatim, undefined = source default).
 */
export async function fetchColognEvents({ ndays = 14, kat } = {}) {
  const url = new URL(EVENTS_URL);
  if (ndays) url.searchParams.set('ndays', String(ndays));
  if (kat) url.searchParams.set('kat', String(kat));

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Stadt Köln Events HTTP ${res.status}`);

  const raw = await res.json();
  // Live shape is { success, count, items: [...] } - not a bare array and
  // not "events" as the field is named everywhere else in this codebase.
  const rows = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);

  const events = [];
  for (const row of rows) {
    const title = (row.title || '').trim();
    const startIso = parseIsoDate(row.beginndatum);
    // A row without a title or a parseable start date isn't a usable
    // event card - skip it rather than rendering "undefined" / a
    // fabricated placeholder date.
    if (!title || !startIso) continue;

    const lat = toNumberOrNull(row.latitude);
    const lng = toNumberOrNull(row.longitude);
    const hasLocation = lat !== null && lng !== null;

    events.push({
      title,
      description: cleanText(row.description),
      startIso,
      endIso: parseIsoDate(row.endedatum || row.beginndatum),
      time: cleanText(row.uhrzeit),
      venue: (row.veranstaltungsort || '').trim() || null,
      street: (row.strasse || '').trim() || null,
      houseNumber: (row.hausnummer || '').trim() || null,
      zip: (row.plz || '').trim() || null,
      city: (row.ort || '').trim() || null,
      district: (row.stadtbezirk || '').trim() || null,
      quarter: (row.stadtteil || '').trim() || null,
      publicTransportHint: cleanText(row.oepnv),
      price: cleanText(row.preis),
      teaserImage: (row.teaserbild || '').trim() || null,
      link: (row.link || '').trim() || null,
      lat,
      lng,
      hasLocation
    });
  }

  // Soonest first
  events.sort((a, b) => new Date(a.startIso) - new Date(b.startIso));

  return {
    timestamp: new Date().toISOString(),
    count: events.length,
    events
  };
}
