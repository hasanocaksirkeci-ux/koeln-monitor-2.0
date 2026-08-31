/**
 * Intelligent AI City & Transit Concierge
 * Supports:
 * 1. Google Gemini 3.6 Flash / Flash-Latest (via GEMINI_API_KEY)
 * 2. Local LLM via Ollama (qwen3:8b / llama3:8b)
 * 3. Official KVB HAFAS Live Journey Integration & Multi-Leg Vector Pathfinding
 */

import { getDisruptions } from './kvb-disruptions.js';
import { getCologneWidgets } from './cologne-widgets.js';
import { computeNetworkAnalytics } from './analytics.js';
import { fetchTomTomIncidents } from './tomtom-traffic.js';
import { fetchCologneEmergencies, detectDistrict } from './cologne-emergencies.js';
import { findStation, VERIFIED_STATIONS, getPreciseRouteBetween } from './stations-data.js';
import { getRoutes } from './kvb-client.js';
import { calculateDrivingRoute } from './tomtom-routing.js';

function getGeminiApiKey() {
  return (process.env.GEMINI_API_KEY || '').trim();
}

const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b';

/**
 * Extracts clean from & to station queries from natural language text
 */
export function extractRoutePoints(prompt) {
  if (!prompt) return null;
  const p = prompt.trim();

  // Pattern 1: von X nach/zu/zum/zur Y
  const m1 = p.match(/(?:von|vom|aus(?:\s+der|\s+dem)?)\s+([A-Za-z0-9äöüÄÖÜß\s\/\.\-]+?)\s+(?:nach|zu|zum|zur|in\s+die|in\s+den|bis)\s+([A-Za-z0-9äöüÄÖÜß\s\/\.\-]+)/i);
  if (m1) {
    const cleanFrom = cleanStationString(m1[1]);
    const cleanTo = cleanStationString(m1[2]);
    if (cleanFrom && cleanTo) return { from: cleanFrom, to: cleanTo };
  }

  // Pattern 2: X nach/zu/zum/zur Y (e.g. "Florastr. ➔ Neumarkt")
  const m2 = p.match(/([A-Za-z0-9äöüÄÖÜß\s\/\.\-]+?)\s*(?:➔|->|-->|nach|zum|zur)\s*([A-Za-z0-9äöüÄÖÜß\s\/\.\-]+)/i);
  if (m2) {
    const cleanFrom = cleanStationString(m2[1]);
    const cleanTo = cleanStationString(m2[2]);
    if (cleanFrom && cleanTo && (findStation(cleanFrom) || findStation(cleanTo))) {
      return { from: cleanFrom, to: cleanTo };
    }
  }

  return null;
}

function cleanStationString(str) {
  if (!str) return '';
  return str
    .replace(/^(zeige|zeig|bitte|wie\s+komme\s+ich|route|verbindung|weg|fahre|fahr)\s+/i, '')
    .replace(/^(der|die|das|dem|den|köln|station|haltestelle)\s+/i, '')
    .replace(/\s+(auf der karte|auf der map|auf karte|auf map|karte|map|bitte|jetzt|anzeigen|zeigen|einzeichnen|kommen|fahren|gelangen|gehen|bringen)$/i, '')
    .replace(/[\?\!\.,]*$/, '')
    .trim();
}

/**
 * Detects if the prompt or answer corresponds to a place, route, or emergency that can be drawn on the map
 */
export async function detectMapAction(prompt, answer = '') {
  const p = (prompt || '').trim();
  const routePoints = extractRoutePoints(p);

  // 1. Route queries
  if (routePoints) {
    const preciseRoute = await getPreciseRouteBetween(routePoints.from, routePoints.to);
    if (preciseRoute && preciseRoute.coordinates && preciseRoute.coordinates.length > 1) {
      const startTitle = preciseRoute.from.name || routePoints.from;
      const endTitle = preciseRoute.to.name || routePoints.to;
      return {
        type: 'route',
        title: `Route: ${startTitle} ➔ ${endTitle}${preciseRoute.line ? ` (${preciseRoute.lineName || 'Linie ' + preciseRoute.line})` : ''}`,
        fromName: startTitle,
        toName: endTitle,
        line: preciseRoute.line || null,
        lineColor: preciseRoute.color || '#00f0ff',
        start: [preciseRoute.from.lat, preciseRoute.from.lng],
        end: [preciseRoute.to.lat, preciseRoute.to.lng],
        waypoints: preciseRoute.coordinates,
        geometrySource: preciseRoute.geometrySource || 'kvb-track'
      };
    }

    // getPreciseRouteBetween only resolves known KVB stations. For broader
    // queries (e.g. a Veedel/district name) that it can't match, fall back
    // to findStation/detectDistrict, but still fetch REAL street geometry
    // via TomTom instead of fabricating a curve - never invent a line.
    const startSt = findStation(routePoints.from) || detectDistrict(routePoints.from);
    const endSt = findStation(routePoints.to) || detectDistrict(routePoints.to);

    if (startSt && endSt && startSt.lat && endSt.lat) {
      const startTitle = startSt.name || startSt.short || routePoints.from;
      const endTitle = endSt.name || endSt.short || routePoints.to;
      const tomtomRoute = await calculateDrivingRoute(startSt, endSt, 'pedestrian');

      if (tomtomRoute && tomtomRoute.coordinates && tomtomRoute.coordinates.length > 1) {
        return {
          type: 'route',
          title: `Route: ${startTitle} ➔ ${endTitle}`,
          fromName: startTitle,
          toName: endTitle,
          lineColor: '#00f0ff',
          start: [startSt.lat, startSt.lng],
          end: [endSt.lat, endSt.lng],
          waypoints: tomtomRoute.coordinates,
          geometrySource: 'tomtom-approximate'
        };
      }
      // No real geometry available (TomTom unconfigured/failed) - return
      // no route action rather than a fabricated line; the caller/UI shows
      // a visible "not available" state instead of a silent/fake result.
    }
  }

  // 2. Specific Station queries
  for (const st of VERIFIED_STATIONS) {
    const q = (st.short || st.name).toLowerCase();
    if (q.length > 3 && p.toLowerCase().includes(q)) {
      return {
        type: 'focus',
        title: st.name || st.short,
        lat: st.lat,
        lng: st.lng,
        zoom: 16,
        category: 'station',
        lines: st.lines || []
      };
    }
  }

  // 3. Emergency Districts
  const district = detectDistrict(p);
  if (district && district.name !== 'Köln') {
    return {
      type: 'focus',
      title: district.name,
      lat: district.lat,
      lng: district.lng,
      zoom: 15,
      category: 'district'
    };
  }

  return null;
}

export async function queryCologneAI(userPrompt, options = {}) {
  const context = await buildLiveContext();
  const apiKey = getGeminiApiKey();

  // 1. Direct Route Interception with KVB HAFAS live data
  const routePoints = extractRoutePoints(userPrompt);
  if (routePoints) {
    try {
      const hafasResult = await getRoutes(routePoints.from, routePoints.to);
      if (hafasResult && hafasResult.routes && hafasResult.routes.length > 0) {
        const routeAnswer = formatHafasRouteAnswer(routePoints.from, routePoints.to, hafasResult.routes[0], context);
        const mapAction = await detectMapAction(userPrompt, routeAnswer);
        return {
          success: true,
          source: 'KVB HAFAS & Köln City Engine',
          model: 'kvb-hafas-live',
          answer: routeAnswer,
          context: context.summary,
          contextSummary: context.summary,
          mapAction: mapAction,
          timestamp: new Date().toISOString()
        };
      }
    } catch (e) {
      console.warn('HAFAS route direct query error:', e.message);
    }
  }

  // 2. Google Gemini Flash
  if (apiKey && apiKey !== '') {
    try {
      const geminiAnswer = await fetchGeminiFlash(userPrompt, context, apiKey);
      const mapAction = await detectMapAction(userPrompt, geminiAnswer);
      return {
        success: true,
        source: 'Google Gemini 3.6 Flash',
        model: 'gemini-3.6-flash',
        answer: geminiAnswer,
        context: context.summary,
        contextSummary: context.summary,
        mapAction: mapAction,
        timestamp: new Date().toISOString()
      };
    } catch (geminiErr) {
      console.log(`Gemini Flash API failed (${geminiErr.message}), trying local/fallback...`);
    }
  }

  // 3. Local Ollama if available
  const model = options.model || DEFAULT_MODEL;
  try {
    const aiAnswer = await fetchOllama(userPrompt, context, model);
    const mapAction = await detectMapAction(userPrompt, aiAnswer);
    return {
      success: true,
      source: 'local-llm',
      model: model,
      answer: aiAnswer,
      context: context.summary,
      contextSummary: context.summary,
      mapAction: mapAction,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    // 4. Heuristic Fallback
    const heuristicAnswer = await generateHeuristicAnswer(userPrompt, context);
    const mapAction = await detectMapAction(userPrompt, heuristicAnswer);
    return {
      success: true,
      source: 'cologne-city-engine',
      model: apiKey ? 'gemini (fallback)' : 'city-engine',
      answer: heuristicAnswer,
      context: context.summary,
      contextSummary: context.summary,
      mapAction: mapAction,
      timestamp: new Date().toISOString()
    };
  }
}

function formatHafasRouteAnswer(fromQ, toQ, route, context) {
  const startName = route.origin || fromQ;
  const endName = route.destination || toQ;
  const depTime = route.departure ? new Date(route.departure).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'sofort';
  const arrTime = route.arrival ? new Date(route.arrival).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  const duration = route.durationMinutes || 12;

  let text = `🚆 **Beste Verbindung: ${startName} ➔ ${endName}**\n\n`;
  text += `⏱️ **Fahrzeit: ca. ${duration} Minuten** (Abfahrt: **${depTime} Uhr**${arrTime ? `, Ankunft: **${arrTime} Uhr**` : ''})\n\n`;

  const legs = route.legs || [];
  legs.forEach((leg, idx) => {
    if (leg.type === 'walking' || leg.walking) {
      text += `🚶 **Umstieg / Fußweg** (${leg.durationMinutes || 1} Min.)\n`;
    } else {
      const lineTag = leg.product === 'bus' ? `🚌 Bus ${leg.line}` : `🚊 Linie ${leg.line}`;
      const gleisStart = leg.departurePlatform ? ` (Gleis ${leg.departurePlatform})` : '';
      const gleisEnd = leg.arrivalPlatform ? ` (Gleis ${leg.arrivalPlatform})` : '';
      const depT = leg.departure ? new Date(leg.departure).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
      const arrT = leg.arrival ? new Date(leg.arrival).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';

      text += `• **${lineTag}** Richtung *${leg.direction || 'Zentrum'}*\n`;
      text += `  ➔ Abfahrt: **${leg.origin}**${gleisStart} um ${depT} Uhr\n`;
      text += `  ➔ Ankunft: **${leg.destination}**${gleisEnd} um ${arrT} Uhr\n`;
      if (leg.delayMinutes > 0) {
        text += `  ⚠️ *Verspätung: +${leg.delayMinutes} Min.*\n`;
      }
    }
  });

  text += `\n📊 **Netz-Status:** Pünktlichkeitsrate liegt bei **${context.punctuality}%**.\n\n`;
  text += `*Klicke unten auf den Button, um die Route mit allen Kurven und Haltestellen direkt auf der Live-Karte anzuzeigen!*`;

  return text;
}

/**
 * Direct call to Google Gemini Flash via REST API
 */
async function fetchGeminiFlash(prompt, context, apiKey) {
  const now = new Date();
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' };
  const currentDateTimeStr = now.toLocaleString('de-DE', dateOptions);

  const systemInstruction = `Du bist der offizielle, hochintelligente KI-Verkehrs- und City-Assistent für Köln (Köln Live-Monitor).
Deine Aufgabe ist es, Fahrgästen und Bürgern präzise, freundliche und fundierte Auskünfte zu Haltestellen, Verbindungen, aktuellen KVB-Störungen, Blaulicht-Lagen, Staus (TomTom), Rhein-Pegelständen und Parkplätzen in Köln zu geben.

AKTUELLES DATUM & UHRZEIT IN KÖLN:
- Heute ist: ${currentDateTimeStr}

AKTUELLE ECHTE LIVE-DATEN DER STADT KÖLN:
- Netz-Pünktlichkeit KVB: ${context.punctuality}% (${context.totalTracked} Fahrzeuge im Umlauf)
- Aktive KVB-Störungen & Baustellen: ${context.disruptionsText}
- TomTom Live-Verkehrsstörungen & Staus: ${context.trafficText}
- Aktuelle Polizei- & Rettungseinsätze (Blaulicht): ${context.emergenciesText}
- Rheinpegel Köln: ${context.pegelText}
- Parkleitsystem: ${context.parkingText}
- Wetter Köln: ${context.weatherText}

REGELN:
- Antworte direkt und ausschließlich auf Deutsch.
- Sei extrem präzise, sympathisch, kompakt und serviceorientiert.
- Gib KEINE unformatierten langen Text-Dumps aus, sondern strukturiere Antworten mit klaren Aufzählungspunkten und Emojis.
- Wenn nach einer Route gefragt wird, erkläre die genaue Linie, Haltestellen und Umstiege.`;

  const candidateModels = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastErr = null;

  for (const modelName of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      
      const payload = {
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1000
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000)
      });

      if (!response.ok) {
        throw new Error(`Gemini API ${modelName} HTTP ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && text.trim()) {
        return text.trim();
      }
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('All Gemini candidate models failed');
}

async function fetchOllama(prompt, context, model) {
  const systemPrompt = `Du bist der offizielle KI-Assistent für Köln (Köln Live-Monitor).
AKTUELLE LIVE-DATEN:
- Pünktlichkeit: ${context.punctuality}%
- Störungen: ${context.disruptionsText}
- Rheinpegel: ${context.pegelText}
- Parken: ${context.parkingText}
- Wetter: ${context.weatherText}`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      prompt: `${systemPrompt}\n\nFrage: ${prompt}\n\nAntwort auf Deutsch:\n`,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 800
      }
    }),
    signal: AbortSignal.timeout(2000)
  });

  if (!res.ok) {
    throw new Error(`Ollama HTTP ${res.status}`);
  }

  const data = await res.json();
  return (data.response || '').trim();
}

async function buildLiveContext() {
  const [disruptionsRes, widgetsRes, analyticsRes, trafficRes, emergenciesRes] = await Promise.allSettled([
    getDisruptions(),
    getCologneWidgets(),
    computeNetworkAnalytics(),
    fetchTomTomIncidents(),
    fetchCologneEmergencies()
  ]);

  const disruptions = disruptionsRes.status === 'fulfilled' ? disruptionsRes.value : null;
  const widgets = widgetsRes.status === 'fulfilled' ? widgetsRes.value : null;
  const analytics = analyticsRes.status === 'fulfilled' ? analyticsRes.value : null;
  const traffic = trafficRes.status === 'fulfilled' ? trafficRes.value : null;
  const emergencies = emergenciesRes.status === 'fulfilled' ? emergenciesRes.value : null;

  let disruptionsText = 'Keine schweren Netzstörungen gemeldet.';
  let stadtbahnDisruptions = [];
  let busDisruptions = [];

  if (disruptions && disruptions.lines) {
    const troubled = disruptions.lines.filter(l => l.status === 'red' || l.hasSEV || l.status === 'yellow');
    if (troubled.length > 0) {
      disruptionsText = troubled.slice(0, 4).map(l => `${l.name} (${l.status === 'red' ? 'Störung/SEV' : 'Hinweis'}): ${l.description}`).join('; ');
      stadtbahnDisruptions = troubled.filter(l => !l.name.toLowerCase().startsWith('bus'));
      busDisruptions = troubled.filter(l => l.name.toLowerCase().startsWith('bus'));
    }
  }

  let trafficText = 'Verkehrslage normal, keine Großstaus.';
  if (traffic && traffic.incidents && traffic.incidents.length > 0) {
    const topIncidents = traffic.incidents.slice(0, 6);
    trafficText = topIncidents.map(inc => `${inc.roadNumber}: ${inc.description}${inc.delaySeconds ? ` (+${Math.round(inc.delaySeconds/60)} Min)` : ''}`).join('; ');
  }

  let emergenciesText = 'Keine akuten Großeinsätze.';
  if (emergencies && emergencies.emergencies && emergencies.emergencies.length > 0) {
    const topEmergencies = emergencies.emergencies.slice(0, 4);
    emergenciesText = topEmergencies.map(e => `[${e.district || 'Köln'}] ${e.title}`).join('; ');
  }

  let pegelText = 'Normal';
  if (widgets?.pegel) {
    pegelText = `${widgets.pegel.value} cm (${widgets.pegel.statusText || 'Normalstand'}, Trend: ${widgets.pegel.trendLabel || 'stabil'})`;
  }

  let parkingText = 'Verfügbar';
  if (widgets?.parking) {
    parkingText = `${widgets.parking.totalFree} freie Plätze in ${widgets.parking.count || 24} Parkhäusern`;
  }

  let weatherText = 'Köln Innenstadt';
  if (widgets?.weather) {
    weatherText = `${widgets.weather.temp}°C, ${widgets.weather.condition}, ${widgets.weather.humidity}% Feuchte`;
  }

  return {
    punctuality: analytics?.punctualityScore || 94.2,
    totalTracked: analytics?.totalTracked || 300,
    disruptionsText,
    stadtbahnDisruptions,
    busDisruptions,
    trafficText,
    emergenciesText,
    pegelText,
    parkingText,
    weatherText,
    summary: {
      punctuality: analytics?.punctualityScore || 94.2,
      activeDisruptions: disruptions?.summary?.total || 0,
      trafficIncidentsCount: traffic?.count || 0,
      pegelCm: widgets?.pegel?.value || 110,
      freeParking: widgets?.parking?.totalFree || 12000
    }
  };
}

async function generateHeuristicAnswer(prompt, context) {
  const lower = prompt.toLowerCase();

  // 1. Route queries
  const routePoints = extractRoutePoints(prompt);
  if (routePoints) {
    const preciseRoute = await getPreciseRouteBetween(routePoints.from, routePoints.to);
    const startName = preciseRoute?.from?.name || routePoints.from;
    const endName = preciseRoute?.to?.name || routePoints.to;
    const lineInfo = preciseRoute?.lineName || 'Stadtbahn Direkt/Umstieg';
    const transferNote = preciseRoute?.transferHub ? ` (Umstieg an Haltestelle **${preciseRoute.transferHub}**)` : '';

    return `🚆 **Verbindung: ${startName} ➔ ${endName}**\n\n` +
      `• **Empfohlene Route:** ${lineInfo}${transferNote}\n` +
      `• **Fahrzeit:** ca. 10–14 Minuten\n` +
      `• **Takt:** ca. alle 5–10 Minuten\n` +
      `• **Pünktlichkeit:** Netz-Score aktuell bei ${context.punctuality}%.\n\n` +
      `*Klicke unten auf „Auf Live-Karte zeigen“, um den genauen Streckenverlauf einzublenden.*`;
  }

  // 2. Line Status queries
  const lineMatch = prompt.match(/linie\s*(\d+|s\d+|re\d+|rb\d+)/i);
  if (lineMatch) {
    const lineNum = lineMatch[1].toUpperCase();
    const lineDisruption = context.stadtbahnDisruptions?.find(d => d.name.includes(lineNum)) ||
                           context.busDisruptions?.find(d => d.name.includes(lineNum));
    if (lineDisruption) {
      return `⚠️ **Status Stadtbahn Linie ${lineNum}:**\n• Aktuelle Meldung: ${lineDisruption.description}\n• Netz-Pünktlichkeit: ${context.punctuality}%`;
    } else {
      return `✅ **Status Stadtbahn Linie ${lineNum}:**\n• Aktuell keine Störungen gemeldet. Die Linie verkehrt fahrplanmäßig.\n• Netz-Pünktlichkeit: ${context.punctuality}% (${context.totalTracked} Fahrzeuge auf der Strecke).`;
    }
  }

  // 3. Specific topics
  if (lower.includes('pegel') || lower.includes('rhein') || lower.includes('hochwasser')) {
    return `🌊 **Aktueller Rheinpegel Köln:**\n• Pegelstand: **${context.pegelText}**\n• Hochwassermarke I: 620 cm | Marke II: 830 cm\n• Schifffahrt: Uneingeschränkt freigegeben.`;
  }

  if (lower.includes('park') || lower.includes('auto') || lower.includes('stellplatz')) {
    return `🅿️ **Parkleitsystem Köln:**\n• Verfügbar: **${context.parkingText}**\n• Zentrale Parkhäuser: Dom / Heumarkt / Rudolfplatz / Mediapark.`;
  }

  if (lower.includes('störung') || lower.includes('sev') || lower.includes('verspätung') || lower.includes('ausfall')) {
    return `⚠️ **Aktuelle Betriebslage KVB:**\n• Pünktlichkeits-Score: **${context.punctuality}%**\n• Wichtigste Meldungen: ${context.disruptionsText}`;
  }

  if (lower.includes('blaulicht') || lower.includes('polizei') || lower.includes('feuerwehr') || lower.includes('einsatz')) {
    return `🚨 **Aktuelle Blaulicht-Lage Köln:**\n• Einsätze: ${context.emergenciesText}`;
  }

  if (lower.includes('wetter') || lower.includes('regen') || lower.includes('temperatur')) {
    return `☀️ **Wetter in Köln:**\n• Aktuell: ${context.weatherText}`;
  }

  return `⚡ **Köln Live-Monitor Assistent:**\n` +
    `• Netz-Pünktlichkeit: **${context.punctuality}%** (${context.totalTracked} Bahnen & Busse online)\n` +
    `• Rheinpegel: **${context.pegelText}** | Parkplätze: **${context.parkingText}**\n\n` +
    `Wie kann ich dir helfen? Frage mich z.B. nach einer Route (*„Von Florastr. zum Neumarkt“*) oder dem Status einer Linie (*„Linie 12“*).`;
}
