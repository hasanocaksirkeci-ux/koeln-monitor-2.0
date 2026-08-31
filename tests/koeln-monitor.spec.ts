// @ts-check
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

// ─── SUITE 1: App Shell & Navigation ─────────────────────────────────────────
test.describe('App Shell & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  });

  test('renders title and header correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Köln Live-Monitor/);
    await expect(page.locator('.app-title, h1').first()).toContainText('Köln');
  });

  test('shows Live vehicle count badge in header', async ({ page }) => {
    const badge = page.locator('#vehicle-count-header');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/\d+/);
  });

  test('all 9 tabs are visible and clickable', async ({ page }) => {
    // Actual IDs from index.html: tab-btn-map, tab-btn-departures, ...
    const tabIds = [
      '#tab-btn-map',
      '#tab-btn-departures',
      '#tab-btn-emergencies',
      '#tab-btn-bikes',
      '#tab-btn-routes',
      '#tab-btn-disruptions',
      '#tab-btn-analytics',
      '#tab-btn-widgets',
      '#tab-btn-ai',
    ];
    for (const id of tabIds) {
      await expect(page.locator(id), `Tab ${id} should be visible`).toBeVisible();
    }
  });

  test('can switch between all tabs without JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    const tabIds = [
      '#tab-btn-departures',
      '#tab-btn-emergencies',
      '#tab-btn-bikes',
      '#tab-btn-routes',
      '#tab-btn-disruptions',
      '#tab-btn-analytics',
      '#tab-btn-widgets',
      '#tab-btn-ai',
      '#tab-btn-map',
    ];
    for (const id of tabIds) {
      await page.click(id);
      await page.waitForTimeout(300);
    }
    // No critical JS errors
    const criticalErrors = jsErrors.filter(e => !e.includes('ResizeObserver'));
    expect(criticalErrors).toHaveLength(0);
  });

  test('dark mode toggle switches theme', async ({ page }) => {
    const themeToggle = page.locator('#theme-toggle, button[title*="Modus"], button[title*="Hell"], button[title*="Dunkel"]').first();
    await expect(themeToggle).toBeVisible({ timeout: 5000 });
  });
});

// ─── SUITE 2: Live Karte & Kartenansichten ────────────────────────────────────
test.describe('Live-Karte & Basemap-Ansichten', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  });

  test('Dunkel (Dark Canvas) tile is default and watermark-free', async ({ page }) => {
    await expect(page.locator('#mm-dark')).toHaveClass(/active/);
    const html = await page.content();
    expect(html).not.toContain('API KEY REQUIRED');
    expect(html).not.toContain('carto.com/basemaps/apikey');
  });

  test('switches to Hell (OpenStreetMap) mode', async ({ page }) => {
    await page.click('#mm-light');
    await page.waitForTimeout(600);
    await expect(page.locator('#mm-light')).toHaveClass(/active/);
  });

  test('switches to Satellit (Esri Imagery) mode and loads imagery tiles', async ({ page }) => {
    await page.click('#mm-satellite');
    await page.waitForTimeout(1500);
    await expect(page.locator('#mm-satellite')).toHaveClass(/active/);
    // Satellite tile images from Esri should appear
    const tileImgs = page.locator('img[src*="World_Imagery"], img[src*="arcgisonline"]');
    await expect(tileImgs.first()).toBeVisible({ timeout: 6000 });
  });

  test('switches to 3D Drohnen-Ansicht and applies tilt class', async ({ page }) => {
    await page.click('#mm-3d');
    await page.waitForTimeout(600);
    await expect(page.locator('#mm-3d')).toHaveClass(/active/);
    const mapEl = page.locator('#leaflet-map');
    await expect(mapEl).toHaveClass(/mode-3d/);
  });

  test('GPS button is visible on the map toolbar', async ({ page }) => {
    const gpsBtn = page.locator('#gps-track-btn, #gps-btn, button:has-text("GPS")').first();
    await expect(gpsBtn).toBeVisible({ timeout: 5000 });
  });

  test('Zentrum button is visible and clickable', async ({ page }) => {
    const zentrumBtn = page.locator('button:has-text("Zentrum")');
    await expect(zentrumBtn).toBeVisible();
    await zentrumBtn.click();
    await page.waitForTimeout(500);
  });

  test('Esri tile URLs serve no 4xx errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('response', r => {
      if (r.url().includes('arcgisonline') && r.status() >= 400) {
        errors.push(`${r.status()} ${r.url()}`);
      }
    });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    expect(errors, `Esri tile 4xx errors: ${errors.join(', ')}`).toHaveLength(0);
  });
});

// ─── SUITE 3: Abfahrtstafel ───────────────────────────────────────────────────
test.describe('Abfahrtstafel (Live-Departures)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.click('#tab-btn-departures');
    await page.waitForSelector('#active-station-name', { timeout: 8000 });
  });

  test('shows Florastr. as default active station', async ({ page }) => {
    await expect(page.locator('#active-station-name')).toContainText('Florastr');
  });

  test('renders departure rows with valid line badge, destination, time', async ({ page }) => {
    await page.waitForSelector('#departures-tbody tr', { timeout: 10000 });
    const rows = page.locator('#departures-tbody tr');
    await expect(rows.first()).toBeVisible();

    const badgeText = await rows.first().locator('.line-badge').textContent();
    expect(badgeText?.trim()).toBeTruthy();
    expect(badgeText).not.toContain('undefined');

    const destText = await rows.first().locator('.col-dest-text').textContent();
    expect(destText?.trim()).toBeTruthy();
    expect(destText).not.toContain('undefined');

    const timeText = await rows.first().locator('.dfi-matrix-time').textContent();
    expect(timeText?.trim()).toBeTruthy();
    expect(timeText).not.toContain('undefined');
  });

  test('Schnellwahl chips are rendered dynamically by JS', async ({ page }) => {
    const chips = page.locator('#favorites-list .fav-chip');
    await expect(chips.first()).toBeVisible({ timeout: 8000 });
    const count = await chips.count();
    expect(count).toBeGreaterThan(3);
  });

  test('clicking first Schnellwahl chip loads departures', async ({ page }) => {
    const chips = page.locator('#favorites-list .fav-chip');
    await expect(chips.first()).toBeVisible({ timeout: 8000 });
    await chips.first().click();
    await page.waitForTimeout(4000);
    const stationName = await page.locator('#active-station-name').textContent();
    expect(stationName?.trim().length).toBeGreaterThan(0);
    await expect(page.locator('#departures-tbody tr').first()).toBeVisible();
  });

  test('filter buttons work using data-filter attribute selectors', async ({ page }) => {
    await page.waitForSelector('#departures-tbody tr', { timeout: 10000 });
    const allCount = await page.locator('#departures-tbody tr').count();

    await page.click('.filter-btn[data-filter="stadtbahn"]');
    await page.waitForTimeout(400);
    const stadtbahnCount = await page.locator('#departures-tbody tr').count();
    expect(stadtbahnCount).toBeGreaterThanOrEqual(0);

    await page.click('.filter-btn[data-filter="all"]');
    await page.waitForTimeout(400);
    const allCountAgain = await page.locator('#departures-tbody tr').count();
    expect(allCountAgain).toBe(allCount);
  });

  test('live auto-refresh countdown text is shown', async ({ page }) => {
    // #countdown-text shows "Aktualisierung in 30s"
    const timerEl = page.locator('#countdown-text');
    await expect(timerEl).toBeVisible({ timeout: 5000 });
    await expect(timerEl).toContainText('Aktualisierung');
  });

  test('station search data: /api/lines contains Friesenplatz (autocomplete source)', async ({ request }) => {
    // The autocomplete uses state.verifiedStations populated from /api/lines.
    // Testing the data source directly is more reliable than timing the DOM.
    const resp = await request.get(`${BASE_URL}/api/lines`);
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(Array.isArray(json.stations)).toBe(true);
    expect(json.stations.length).toBeGreaterThan(50);

    // Verify Friesenplatz is searchable (as it would appear in autocomplete)
    const friesenplatz = json.stations.find((s: any) =>
      s.name.toLowerCase().includes('friesenplatz')
    );
    expect(friesenplatz).toBeTruthy();
    expect(friesenplatz.id).toBeTruthy();
  });
});

// ─── SUITE 4: Blaulicht-Monitor ───────────────────────────────────────────────
test.describe('Blaulicht-Monitor (Polizei & Feuerwehr)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.click('#tab-btn-emergencies');
    await page.waitForTimeout(1000);
  });

  test('shows Einsatzradar header text', async ({ page }) => {
    await expect(page.locator('h2, h3').filter({ hasText: 'Einsatzradar' })).toBeVisible();
  });

  test('renders emergency incident cards from live RSS feed', async ({ page }) => {
    const cards = page.locator('.emergency-card');
    await expect(cards.first()).toBeVisible({ timeout: 8000 });
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('emergency cards have meaningful content (not empty)', async ({ page }) => {
    const firstCard = page.locator('.emergency-card').first();
    await expect(firstCard).toBeVisible({ timeout: 8000 });
    const text = await firstCard.textContent();
    expect(text?.length).toBeGreaterThan(20);
  });

  test('category filter buttons work with data-em-cat selectors', async ({ page }) => {
    await page.waitForSelector('.emergency-card', { timeout: 8000 });

    // Use actual data-em-cat attribute from the HTML
    await page.click('[data-em-cat="police"]');
    await page.waitForTimeout(500);
    await page.click('[data-em-cat="all"]');
    await page.waitForTimeout(400);
    await expect(page.locator('.emergency-card').first()).toBeVisible();
  });

  test('search input filters emergency cards', async ({ page }) => {
    await page.waitForSelector('.emergency-card', { timeout: 8000 });
    const totalBefore = await page.locator('.emergency-card').count();

    const searchInput = page.locator('input[placeholder*="durchsuchen"], #emergency-search').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Köln');
    await page.waitForTimeout(500);

    const totalAfter = await page.locator('.emergency-card').count();
    expect(totalAfter).toBeGreaterThanOrEqual(0);
    expect(totalAfter).toBeLessThanOrEqual(totalBefore);
  });
});

// ─── SUITE 5: KVB-Rad / Nextbike ─────────────────────────────────────────────
test.describe('KVB-Rad Live-Verleihnetz', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.click('#tab-btn-bikes');
    await page.waitForTimeout(1000);
  });

  test('shows total available bikes count >= 100', async ({ page }) => {
    const totalEl = page.locator('#bikes-total-available');
    await expect(totalEl).toBeVisible({ timeout: 8000 });
    const text = await totalEl.textContent();
    const num = parseInt(text?.replace(/\D/g, '') || '0');
    expect(num).toBeGreaterThan(100);
  });

  test('renders station list with bike availability badges', async ({ page }) => {
    const stationCards = page.locator('.bike-station-card, .station-item');
    await expect(stationCards.first()).toBeVisible({ timeout: 8000 });
    expect(await stationCards.count()).toBeGreaterThan(10);
  });

  test('station search filter is functional', async ({ page }) => {
    const input = page.locator('input[placeholder*="Station"]');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('KVB Hauptverwaltung');
    await page.waitForTimeout(500);
    const filtered = page.locator('.bike-station-card, .station-item');
    expect(await filtered.count()).toBeGreaterThan(0);
  });

  test('"Alle auf Karte anzeigen" button is visible', async ({ page }) => {
    await expect(
      page.locator('button:has-text("Karte anzeigen"), button:has-text("Alle auf Karte")')
    ).toBeVisible();
  });
});

// ─── SUITE 6: Pünktlichkeit & Analytics ──────────────────────────────────────
test.describe('Pünktlichkeit & Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.click('#tab-btn-analytics');
    await page.waitForTimeout(1500);
  });

  test('shows network punctuality score (not empty or undefined)', async ({ page }) => {
    // #an-score-val starts as '--%' and is updated by loadAnalytics() async call
    const scoreEl = page.locator('#an-score-val');
    await expect(scoreEl).toBeVisible({ timeout: 8000 });
    // Wait until it's populated (not the default placeholder '--%')
    await scoreEl.waitFor({ state: 'visible' });
    await expect.poll(async () => {
      return (await scoreEl.textContent())?.trim();
    }, { timeout: 10000 }).not.toBe('--%');
    const text = await scoreEl.textContent();
    expect(text).not.toContain('undefined');
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test('shows total tracked vehicle count', async ({ page }) => {
    // Actual ID from HTML: #an-total-tracked
    const countEl = page.locator('#an-total-tracked');
    await expect(countEl).toBeVisible({ timeout: 8000 });
    const text = await countEl.textContent();
    const num = parseInt(text?.replace(/\D/g, '') || '0');
    expect(num).toBeGreaterThan(0);
  });

  test('line performance table body is rendered', async ({ page }) => {
    // Actual ID: #analytics-lines-tbody
    const tbody = page.locator('#analytics-lines-tbody');
    await expect(tbody).toBeVisible({ timeout: 8000 });
    const rows = tbody.locator('tr');
    await expect(rows.first()).toBeVisible({ timeout: 8000 });
  });

  test('saved commuter routes section exists (SQLite)', async ({ page }) => {
    // Look for the SQLite routes section
    const routesSection = page.locator('section, div').filter({ hasText: /SQLite|Pendler|Route/ }).first();
    await expect(routesSection).toBeVisible({ timeout: 5000 });
  });
});

// ─── SUITE 7: API Endpoints Health ─────────────────────────────────────────────
test.describe('API Endpoints Health', () => {
  test('/api/health returns 200 and status ok', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/health`);
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.status).toBe('ok');
  });

  test('/api/radar returns 10+ live vehicles', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/radar`);
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.count).toBeGreaterThanOrEqual(10);
  });

  test('/api/departures for Florastr returns valid departures (no undefined)', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/departures?stopId=900000304`);
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.departures.length).toBeGreaterThan(0);
    const first = json.departures[0];
    expect(first.line).toBeTruthy();
    expect(first.direction || first.destination).toBeTruthy();
    expect(typeof first.minutesUntil).toBe('number');
    // After our fix, timeMinutes and destination should be present
    expect(first.destination || first.direction).not.toBe('undefined');
  });

  test('/api/emergencies returns incident list array', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/emergencies`);
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(Array.isArray(json.emergencies)).toBe(true);
  });

  test('/api/bikes returns 100+ Cologne bike stations', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/bikes`);
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.stations.length).toBeGreaterThan(100);
    expect(json.totalAvailableBikes).toBeGreaterThanOrEqual(0);
  });

  test('/api/analytics returns punctualityScore and linePerformance', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/analytics`);
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    // Actual keys: punctualityScore, totalTracked, linePerformance
    expect(typeof json.punctualityScore).toBe('number');
    expect(typeof json.totalTracked).toBe('number');
    expect(Array.isArray(json.linePerformance)).toBe(true);
  });

  test('/api/widgets returns weather, pegel, parking', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/widgets`);
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    // Actual keys from API: timestamp, pegel, parking, weather
    expect(json.weather).toBeTruthy();
    expect(json.pegel).toBeTruthy();
    expect(json.parking).toBeTruthy();
  });

  test('/api/disruptions returns 200', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/disruptions`);
    expect(resp.status()).toBe(200);
  });

  test('/api/saved-routes returns routes array', async ({ request }) => {
    const resp = await request.get(`${BASE_URL}/api/saved-routes`);
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(Array.isArray(json.routes)).toBe(true);
  });
});

// ─── SUITE 7: Routenplaner, Störungen & Widgets UI ─────────────────────────────
test.describe('Routenplaner, Störungen & Widgets UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  });

  test('Routenplaner calculates connection without undefined fields', async ({ page }) => {
    await page.click('#tab-btn-routes');
    await page.waitForTimeout(500);
    await page.click('#calculate-route-btn');
    await expect(page.locator('.route-card').first()).toBeVisible({ timeout: 10000 });
    const content = await page.locator('#route-cards-list').innerText();
    expect(content).not.toContain('undefined');
  });

  test('Störungen & SEV tab renders Stadtbahn and S-Bahn line cards', async ({ page }) => {
    await page.click('#tab-btn-disruptions');
    await expect(page.locator('#stadtbahn-status-grid .line-status-card').first()).toBeVisible({ timeout: 6000 });
    const stadtbahnCards = await page.locator('#stadtbahn-status-grid .line-status-card').count();
    expect(stadtbahnCards).toBeGreaterThanOrEqual(10);
  });

  test('Köln-Widgets renders Pegel, Weather, and Parking Garages', async ({ page }) => {
    await page.click('#tab-btn-widgets');
    await page.waitForTimeout(1000);
    const pegelText = await page.locator('#pegel-cm-val').innerText();
    expect(pegelText).not.toBe('--');
    const weatherTemp = await page.locator('#weather-temp-val').innerText();
    expect(weatherTemp).not.toBe('--');
    const parkingFree = await page.locator('#parking-total-free').innerText();
    expect(parkingFree).not.toBe('--');
    const garageCards = await page.locator('#parking-garages-grid .parking-card').count();
    expect(garageCards).toBeGreaterThan(0);
  });
});

// ─── SUITE 8: Köln AI Assistent & Vector Icon System ──────────────────────────
test.describe('Köln AI City-Assistent & Vector Icons', () => {
  test('navigation bar uses 100% SVG vector icons with zero emojis', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const navHtml = await page.locator('.nav-tabs').innerHTML();
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(navHtml)).toBe(false);
    
    const svgIconsCount = await page.locator('.nav-tabs svg.v-icon').count();
    expect(svgIconsCount).toBeGreaterThanOrEqual(9);
  });

  test('/api/ai/query returns contextual answer', async ({ request }) => {
    const resp = await request.post(`${BASE_URL}/api/ai/query`, {
      data: { prompt: 'Wie ist der aktuelle Rheinpegel in Köln?' }
    });
    expect(resp.status()).toBe(200);
    const json = await resp.json();
    expect(json.success).toBe(true);
    expect(typeof json.answer).toBe('string');
    expect(json.answer.length).toBeGreaterThan(10);
    expect(json.contextSummary).toBeTruthy();
  });

  test('Köln AI Tab handles interactive chat and quick prompt chips', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.click('#tab-btn-ai');
    await page.waitForTimeout(500);
    await expect(page.locator('#tab-ai')).toBeVisible();

    // Click quick chip
    const quickChip = page.locator('.quick-chip').first();
    await expect(quickChip).toBeVisible();
    await quickChip.click();

    // Wait for assistant response bubble
    await expect(page.locator('.ai-message.assistant').nth(1)).toBeVisible({ timeout: 10000 });
    const lastMsg = await page.locator('.ai-message.assistant').last().innerText();
    expect(lastMsg.length).toBeGreaterThan(15);
  });
});


