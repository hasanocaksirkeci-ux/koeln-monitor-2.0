import { LINE_COLORS, getLineColor } from './stations-data.js';

let disruptionsCache = null;
let lastFetchTime = 0;
const CACHE_TTL = 60000; // 60s

const ALL_STADTBAHN_LINES = ['1', '3', '4', '5', '7', '9', '12', '13', '15', '16', '17', '18'];
const MAJOR_SBAHN_LINES = ['S6', 'S11', 'S12', 'S19'];

/**
 * Fetch and parse official KVB disruptions & construction notices
 */
export async function getDisruptions({ force = false } = {}) {
  const now = Date.now();
  if (!force && disruptionsCache && (now - lastFetchTime < CACHE_TTL)) {
    return disruptionsCache;
  }

  try {
    const res = await fetch('https://www.kvb.koeln/fahrtinfo/betriebslage/index.html', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) {
      throw new Error(`KVB Server returned HTTP ${res.status}`);
    }

    const buf = await res.arrayBuffer();
    const decoder = new TextDecoder('windows-1252');
    const html = decoder.decode(buf);

    const activeReports = parseKvbHtml(html);
    const result = formatDisruptionsData(activeReports);

    disruptionsCache = {
      ...result,
      source: 'KVB Betriebslage',
      status: 'live',
      lastSuccessfulUpdate: new Date().toISOString()
    };
    lastFetchTime = now;
    return disruptionsCache;
  } catch (err) {
    console.error('Error fetching KVB disruptions:', err.message);
    if (disruptionsCache) {
      return { ...disruptionsCache, status: 'stale', isStale: true, error: err.message };
    }
    return {
      timestamp: new Date().toISOString(),
      source: 'KVB Betriebslage',
      status: 'error',
      summary: { total: 0, severe: 0, warning: 0, normal: 0 },
      lines: [],
      reports: [],
      error: err.message,
      lastSuccessfulUpdate: null
    };
  }
}

/**
 * Parse raw HTML from kvb.koeln betriebslage
 */
function parseKvbHtml(html) {
  const reports = [];

  const itemRegex = /<li class="list-group-item([^"]*)">([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = itemRegex.exec(html)) !== null) {
    const classAttr = match[1] || '';
    const content = match[2] || '';

    if (content.includes('Keine Störungen vorhanden') || content.includes('zur Zeit keine Meldungen')) {
      continue;
    }

    let line = '';
    const lineBadgeMatch = content.match(/<span class="badge[^>]*>([\s\S]*?)<\/span>/i);
    if (lineBadgeMatch) {
      line = lineBadgeMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    let title = '';
    const titleMatch = content.match(/<h[345][^>]*>([\s\S]*?)<\/h[345]>/i);
    if (titleMatch) {
      title = cleanHtmlText(titleMatch[1]);
    }

    const descClean = cleanHtmlText(content);
    if (!descClean || descClean.length < 5) continue;

    const lower = (descClean + ' ' + title).toLowerCase();
    const hasSEV = lower.includes('ersatzbus') || lower.includes('sev') || lower.includes('schienenersatzverkehr') || lower.includes('ersatzverkehr');
    const isSevere = hasSEV || lower.includes('gesperrt') || lower.includes('streckensperrung') || lower.includes('eingestellt') || lower.includes('unterbrochen');
    const isWarning = lower.includes('verspätung') || lower.includes('baustelle') || lower.includes('behinderung') || lower.includes('umleitung') || lower.includes('gleisbau');

    const status = isSevere ? 'red' : (isWarning ? 'yellow' : 'yellow');

    const linesFound = extractLineNumbers(title, descClean, line);

    if (linesFound.length === 0 && line) {
      linesFound.push(line);
    }
    if (linesFound.length === 0) {
      linesFound.push('Allgemein');
    }

    for (const l of linesFound) {
      reports.push({
        line: l,
        title: title || `Meldung Linie ${l}`,
        description: descClean,
        status,
        hasSEV,
        timestamp: new Date().toISOString()
      });
    }
  }

  return reports;
}

function cleanHtmlText(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&auml;/g, 'ä')
    .replace(/&ouml;/g, 'ö')
    .replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLineNumbers(title, desc, badgeLine) {
  const lines = new Set();
  if (badgeLine && badgeLine.length <= 4) {
    lines.add(badgeLine);
  }

  const text = `${title} ${desc}`;
  const patterns = [
    /(?:Linie|Linien)\s+([0-9\s,\/und]+)/gi,
    /\b(S\s*6|S\s*11|S\s*12|S\s*19)\b/gi,
    /\b(RB\s*25|RB\s*48|RE\s*1|RE\s*5|RE\s*9)\b/gi
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const matched = match[1] || match[0];
      const numbers = matched.match(/\b([1-9]|1[2-8]|S\d+|RB\d+|RE\d+|\d{3})\b/gi);
      if (numbers) {
        numbers.forEach(n => lines.add(n.replace(/\s+/g, '').toUpperCase()));
      }
    }
  }

  return Array.from(lines);
}

function formatDisruptionsData(reports) {
  const reportsByLine = new Map();
  reports.forEach(r => {
    if (!reportsByLine.has(r.line)) reportsByLine.set(r.line, []);
    reportsByLine.get(r.line).push(r);
  });

  const linesList = [];

  // 1. Build Stadtbahn lines matrix (1 to 18)
  let normalCount = 0;
  ALL_STADTBAHN_LINES.forEach(lineId => {
    const lineReports = reportsByLine.get(lineId) || [];
    const style = getLineColor(lineId);
    
    let status = 'green';
    let summaryText = 'Normalbetrieb (Keine Störungen)';
    let hasSEV = false;

    if (lineReports.length > 0) {
      const hasRed = lineReports.some(r => r.status === 'red');
      status = hasRed ? 'red' : 'yellow';
      hasSEV = lineReports.some(r => r.hasSEV);
      summaryText = lineReports[0].description;
    } else {
      normalCount++;
    }

    linesList.push({
      id: lineId,
      name: `Linie ${lineId}`,
      type: 'stadtbahn',
      status,
      hasSEV,
      description: summaryText,
      lineColor: style.bg,
      lineTextColor: style.text,
      reports: lineReports
    });
  });

  // 2. Build S-Bahn lines matrix
  MAJOR_SBAHN_LINES.forEach(lineId => {
    const lineReports = reportsByLine.get(lineId) || [];
    const style = getLineColor(lineId);
    const status = lineReports.length > 0 ? (lineReports.some(r => r.status === 'red') ? 'red' : 'yellow') : 'green';
    
    linesList.push({
      id: lineId,
      name: `S-Bahn ${lineId}`,
      type: 's-bahn',
      status,
      hasSEV: lineReports.some(r => r.hasSEV),
      description: lineReports.length > 0 ? lineReports[0].description : 'Normalbetrieb laut Fahrplan',
      lineColor: style.bg,
      lineTextColor: style.text,
      reports: lineReports
    });
  });

  // 3. Bus lines with disruptions
  for (const [lineId, lineReports] of reportsByLine.entries()) {
    if (!ALL_STADTBAHN_LINES.includes(lineId) && !MAJOR_SBAHN_LINES.includes(lineId) && lineId !== 'Allgemein') {
      const style = getLineColor(lineId);
      const hasRed = lineReports.some(r => r.status === 'red');
      linesList.push({
        id: lineId,
        name: `Bus ${lineId}`,
        type: 'bus',
        status: hasRed ? 'red' : 'yellow',
        hasSEV: lineReports.some(r => r.hasSEV),
        description: lineReports[0].description,
        lineColor: style.bg,
        lineTextColor: style.text,
        reports: lineReports
      });
    }
  }

  const severeCount = reports.filter(r => r.status === 'red').length;
  const warningCount = reports.filter(r => r.status === 'yellow').length;

  return {
    timestamp: new Date().toISOString(),
    summary: {
      total: reports.length,
      severe: severeCount,
      warning: warningCount,
      normal: normalCount
    },
    lines: linesList,
    reports
  };
}
