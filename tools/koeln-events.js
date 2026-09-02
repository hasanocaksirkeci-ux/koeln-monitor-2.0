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

// The feed has no category field at all (verified against the live JSON -
// every row has the same flat shape), and the source API's own `kat`
// query parameter returns an empty body for every value tried (numeric
// IDs and German category names alike) - so filtering has to happen on
// the event's own text, not on API metadata that doesn't exist. Stadt
// Köln mixes real public events into the same feed as administrative
// planning notices ("Bauleitplanung" / Bebauungsplan-Offenlage), which
// read like an event ("Max Becker-Areal in Köln-Ehrenfeld", office hours
// as its "Uhrzeit") but are really "come view documents and file an
// objection" - not something matching "was ist heute los in Köln".
// These use consistent official terminology; matched against 525 live
// events across a 180-day window, this caught the one real notice with
// no false positives (checked venue-based heuristics too - "Amt" alone
// false-positives on genuine venues like "Amt für Weiterbildung/Kölner
// Volkshochschule", so this stays text-only).
const ADMINISTRATIVE_NOTICE_PATTERN =
  /bebauungsplan|bekanntmachung|offenlage|offenlegung|satzung|stellungnahme|bauleitplan/i;

function isAdministrativeNotice(row) {
  return ADMINISTRATIVE_NOTICE_PATTERN.test(`${row.title || ''} ${row.description || ''}`);
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
    // Administrative planning notice, not a public event - see
    // ADMINISTRATIVE_NOTICE_PATTERN above for why this is filtered here.
    if (isAdministrativeNotice(row)) continue;

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
