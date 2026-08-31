let widgetsCache = null;
let lastWidgetsFetch = 0;
const WIDGETS_CACHE_TTL = 120000; // 2 minutes

// Known garage nominal capacities for Cologne garages where API reports free spots
const GARAGE_CAPACITIES = {
  'PH01': 500, // Hauptbahnhof
  'PH02': 600, // Am Dom
  'PH03': 300, // Groß St. Martin
  'PH04': 650, // Brückenstraße
  'PH06': 400, // Maastrichter Str.
  'PH07': 350, // Im Klapperhof
  'PH09': 350, // Philharmonie
  'PH10': 450, // Stadtmitte
  'PH11': 950, // Galeria Kaufhof
  'PH13': 350, // Schildergasse
  'PH14': 380, // Theater-Parkhaus
  'PH15': 600, // Opernpassagen
  'PH16': 450, // Maritim
  'PH17': 300, // Am Neumarkt
  'PH18': 300, // Alte Wallgasse
  'PH19': 400, // Gürzenich
  'PH20': 500, // Galeria Karstadt
  'PH22': 460, // Heumarkt
  'PH23': 300, // Lungengasse
  'PH24': 350, // Wolfsstraße
  'PH25': 250, // Bazaar de Cologne
  'PH26': 300, // Quincy
  'PH28': 1000, // P+R Stadion
  'PH29': 400, // Kaiser-Wilhelm-Ring
  'PH30': 350, // Rudolfplatz
  'PH31': 200, // An Farina
  'PH33': 800, // Mediapark
  'PH35': 300, // Gerling Ring Karree
  'PH36': 600, // P+R Marsdorf
  'D_P001': 1000, // LANXESS arena 1
  'D_P002': 250, // LANXESS arena 2
  'D_P004': 300, // LANXESS arena 4
  'D_P006': 2000, // Köln Arcaden
};

export async function getCologneWidgets({ force = false } = {}) {
  const now = Date.now();
  if (!force && widgetsCache && (now - lastWidgetsFetch < WIDGETS_CACHE_TTL)) {
    return widgetsCache;
  }

  const [pegel, parking, weather] = await Promise.allSettled([
    fetchPegelOnline(),
    fetchParkingData(),
    fetchWeatherData()
  ]);

  const result = {
    timestamp: new Date().toISOString(),
    pegel: pegel.status === 'fulfilled' ? pegel.value : getFallbackPegel(),
    parking: parking.status === 'fulfilled' ? parking.value : getFallbackParking(),
    weather: weather.status === 'fulfilled' ? weather.value : getFallbackWeather()
  };

  widgetsCache = result;
  lastWidgetsFetch = now;
  return result;
}

/**
 * 1. Fetch WSV PegelOnline for Cologne
 */
async function fetchPegelOnline() {
  const stationUuid = 'a6ee8177-107b-47dd-bcfd-30960ccc6e9c'; // KÖLN Rhein
  const currentUrl = `https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/${stationUuid}/W/currentmeasurement.json`;
  const historyUrl = `https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/${stationUuid}/W/measurements.json?hours=4`;

  const [currRes, histRes] = await Promise.all([
    fetch(currentUrl, { signal: AbortSignal.timeout(4000) }),
    fetch(historyUrl, { signal: AbortSignal.timeout(4000) })
  ]);

  if (!currRes.ok) throw new Error(`Pegel current error ${currRes.status}`);

  const curr = await currRes.json();
  let hist = [];
  try {
    if (histRes.ok) hist = await histRes.json();
  } catch { /* optional */ }

  const currentVal = Math.round(curr.value);
  
  // Calculate trend from last 3-4 hours
  let trend = 'steady';
  let diffCm = 0;
  if (hist && hist.length > 2) {
    const oldest = hist[0].value;
    const diff = currentVal - oldest;
    diffCm = Math.round(diff);
    if (diff > 1.5) trend = 'rising';
    else if (diff < -1.5) trend = 'falling';
    else trend = 'steady';
  }

  // Flood status evaluation
  let status = 'normal';
  let statusText = 'Normaler Wasserstand';
  if (currentVal >= 830) {
    status = 'marke2';
    statusText = 'Hochwassermarke II (Schifffahrt gesperrt)';
  } else if (currentVal >= 620) {
    status = 'marke1';
    statusText = 'Hochwassermarke I (Schifffahrt gedrosselt)';
  } else if (currentVal < 100) {
    status = 'low';
    statusText = 'Niedrigwasser';
  }

  return {
    station: 'Köln',
    water: 'Rhein (km 688,0)',
    value: currentVal,
    valueCm: currentVal,
    timestamp: curr.timestamp,
    trend,
    diffCm,
    trendLabel: trend === 'rising' ? `Steigend (+${diffCm} cm / 4h)` : (trend === 'falling' ? `Fallend (${diffCm} cm / 4h)` : 'Gleichbleibend'),
    status,
    statusText,
    warningMarks: {
      marke1: 620,
      marke2: 830
    },
    gaugePercentage: Math.min(100, Math.max(5, Math.round((currentVal / 900) * 100)))
  };
}

/**
 * 2. Fetch Cologne Parking Data from Stadt Köln Open Data
 */
async function fetchParkingData() {
  const url = 'https://www.stadt-koeln.de/externe-dienste/open-data/parking.php';
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Parking API error ${res.status}`);

  const data = await res.json();
  const features = data.features || [];

  const garages = [];
  let totalFree = 0;
  let totalCap = 0;

  for (const f of features) {
    const attr = f.attributes || {};
    const name = (attr.parkhaus || '').trim();
    const id = attr.identifier || '';
    const free = typeof attr.kapazitaet === 'number' ? attr.kapazitaet : -1;
    const rawTrend = attr.tendenz;

    // Filter out invalid/closed or unannounced garages
    if (!name || name === 'null' || free < 0) continue;

    const estimatedTotal = GARAGE_CAPACITIES[id] || (free > 300 ? free + 150 : Math.max(200, Math.round(free * 1.6)));
    const occupancyPercent = estimatedTotal > 0 ? Math.min(100, Math.max(0, Math.round(((estimatedTotal - free) / estimatedTotal) * 100))) : 50;

    let status = 'green';
    if (free === 0 || occupancyPercent > 92) status = 'red';
    else if (free < 30 || occupancyPercent > 75) status = 'yellow';

    let trend = 'steady';
    if (rawTrend === 1) trend = 'rising'; // more free spots
    else if (rawTrend === 2) trend = 'falling'; // fewer free spots

    // Identify quarter / zone
    let quarter = 'Zentrum';
    if (/dom|hauptbahnhof|martin|philharmonie/i.test(name)) quarter = 'Dom / Hbf';
    else if (/neumarkt|schildergasse|kaufhof|karstadt|grzenich|guerzenich|gürzenich|lungengasse|wolfsstra/i.test(name)) quarter = 'Neumarkt';
    else if (/rudolfplatz|ring|wallgasse|mediapark|maastrichter|klapperhof|farina|quincy/i.test(name)) quarter = 'Ringe & Altstadt';
    else if (/arena|deutz|arcaden/i.test(name)) quarter = 'Deutz / Arena';
    else if (/stadion|marsdorf/i.test(name)) quarter = 'P+R / Westen';

    totalFree += free;
    totalCap += estimatedTotal;

    garages.push({
      id,
      name: name.replace(/\s+/g, ' '),
      quarter,
      free,
      total: estimatedTotal,
      occupancyPercent,
      status,
      trend,
      coordinates: f.geometry ? { lat: f.geometry.y, lng: f.geometry.x } : null
    });
  }

  // Sort by most prominent city garages first
  garages.sort((a, b) => {
    const aDom = /dom|hauptbahnhof|neumarkt|heumarkt/i.test(a.name) ? -1 : 1;
    const bDom = /dom|hauptbahnhof|neumarkt|heumarkt/i.test(b.name) ? -1 : 1;
    if (aDom !== bDom) return aDom - bDom;
    return b.free - a.free;
  });

  return {
    timestamp: new Date().toISOString(),
    totalFree,
    totalCapacity: totalCap,
    availablePercent: totalCap > 0 ? Math.round((totalFree / totalCap) * 100) : 0,
    count: garages.length,
    garages
  };
}

/**
 * 3. Fetch Weather from Open-Meteo
 */
async function fetchWeatherData() {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=50.9375&longitude=6.9603&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&timezone=Europe%2FBerlin&forecast_hours=7';
  
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Weather error ${res.status}`);

  const data = await res.json();
  const curr = data.current || {};
  const hourly = data.hourly || {};

  const weatherCode = curr.weather_code ?? 0;
  const weatherInfo = getWeatherDescription(weatherCode);

  const hourlyForecast = [];
  if (hourly.time && hourly.time.length) {
    for (let i = 0; i < Math.min(6, hourly.time.length); i++) {
      const timeStr = hourly.time[i];
      const hour = new Date(timeStr).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      hourlyForecast.push({
        time: hour,
        temp: Math.round(hourly.temperature_2m[i] * 10) / 10,
        rainProb: hourly.precipitation_probability ? hourly.precipitation_probability[i] : 0,
        weatherCode: hourly.weather_code[i],
        icon: getWeatherDescription(hourly.weather_code[i]).icon
      });
    }
  }

  return {
    city: 'Köln',
    temp: Math.round(curr.temperature_2m * 10) / 10,
    feelsLike: Math.round(curr.apparent_temperature * 10) / 10,
    humidity: curr.relative_humidity_2m,
    windSpeed: Math.round(curr.wind_speed_10m),
    weatherCode,
    condition: weatherInfo.label,
    icon: weatherInfo.icon,
    rainProbNow: hourlyForecast.length ? hourlyForecast[0].rainProb : 0,
    hourly: hourlyForecast
  };
}

function getWeatherDescription(code) {
  switch (code) {
    case 0: return { label: 'Klarer Himmel', icon: '☀️' };
    case 1: return { label: 'Überwiegend klar', icon: '🌤️' };
    case 2: return { label: 'Teilweise bewölkt', icon: '⛅' };
    case 3: return { label: 'Bedeckt', icon: '☁️' };
    case 45:
    case 48: return { label: 'Nebel / Dunst', icon: '🌫️' };
    case 51:
    case 53:
    case 55: return { label: 'Leichter Nieselregen', icon: '🌦️' };
    case 61:
    case 63: return { label: 'Regen', icon: '🌧️' };
    case 65: return { label: 'Starker Regen', icon: '🌧️' };
    case 71:
    case 73:
    case 75: return { label: 'Schneefall', icon: '❄️' };
    case 80:
    case 81:
    case 82: return { label: 'Regenschauer', icon: '🌦️' };
    case 95:
    case 96:
    case 99: return { label: 'Gewitter', icon: '⛈️' };
    default: return { label: 'Heiter', icon: '🌤️' };
  }
}

function getFallbackPegel() {
  return {
    station: 'Köln',
    water: 'Rhein (km 688,0)',
    value: 112,
    valueCm: 112,
    trend: 'steady',
    trendLabel: 'Gleichbleibend',
    status: 'normal',
    statusText: 'Normaler Wasserstand',
    warningMarks: { marke1: 620, marke2: 830 },
    gaugePercentage: 15
  };
}

function getFallbackParking() {
  return {
    totalFree: 2500,
    totalCapacity: 8000,
    availablePercent: 31,
    count: 20,
    garages: []
  };
}

function getFallbackWeather() {
  return {
    city: 'Köln',
    temp: 22,
    feelsLike: 22,
    humidity: 55,
    windSpeed: 8,
    condition: 'Heiter',
    icon: '🌤️',
    hourly: []
  };
}
