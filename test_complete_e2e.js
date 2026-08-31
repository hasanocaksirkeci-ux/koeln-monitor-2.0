import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function runCompleteE2ETests() {
  console.log('=====================================================================');
  console.log('🚀 Starting Complete Köln Live-Monitor End-to-End Browser Test Suite');
  console.log('=====================================================================\n');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  let passed = 0;
  let total = 0;

  function assert(title, condition) {
    total++;
    if (condition) {
      console.log(`[Test ${total.toString().padStart(2, '0')}] ${title}... ✅ PASSED`);
      passed++;
    } else {
      console.error(`[Test ${total.toString().padStart(2, '0')}] ${title}... ❌ FAILED`);
    }
  }

  try {
    // 1. Initial Page Load
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);

    assert('Page Title is correct', (await page.title()).includes('Köln Live-Monitor'));
    assert('Leaflet Map Canvas initialized and visible', await page.isVisible('#leaflet-map'));

    // 2. Navigation Rail Tabs
    assert('Navigation Rail exists', await page.isVisible('.nav-rail'));
    assert('Departures Tab button exists', await page.isVisible('#tab-btn-departures'));
    assert('Emergencies Tab button exists', await page.isVisible('#tab-btn-emergencies'));
    assert('Bikes Tab button exists', await page.isVisible('#tab-btn-bikes'));
    assert('Routes Tab button exists', await page.isVisible('#tab-btn-routes'));
    assert('Disruptions Tab button exists', await page.isVisible('#tab-btn-disruptions'));
    assert('Analytics Tab button exists', await page.isVisible('#tab-btn-analytics'));
    assert('Widgets Tab button exists', await page.isVisible('#tab-btn-widgets'));

    // 3. Transit Quick-HUD Bar & Mode Switcher
    assert('Transit Quick-HUD bar is visible', await page.isVisible('#transit-hud-bar'));
    
    const allIsActive = await page.evaluate(() => document.getElementById('tmode-all')?.classList.contains('active'));
    assert('Mode Switcher [Alle] is active by default', !!allIsActive);
    assert('Mode Switcher [🚇 Bahnen] exists', await page.isVisible('#tmode-bahn'));
    assert('Mode Switcher [🚌 Busse] exists', await page.isVisible('#tmode-bus'));

    // 4. Test Switching to Bus Only mode
    await page.click('#tmode-bus');
    await page.waitForTimeout(500);
    const busIsActive = await page.evaluate(() => document.getElementById('tmode-bus')?.classList.contains('active'));
    assert('Transit HUD mode switch to [🚌 Busse] functions', !!busIsActive);

    // 5. Test Switching to Stadtbahn Only mode
    await page.click('#tmode-bahn');
    await page.waitForTimeout(500);
    const bahnIsActive = await page.evaluate(() => document.getElementById('tmode-bahn')?.classList.contains('active'));
    assert('Transit HUD mode switch to [🚇 Bahnen] functions', !!bahnIsActive);

    // 6. Test Switching back to [Alle]
    await page.click('#tmode-all');
    await page.waitForTimeout(500);
    const allIsActiveAgain = await page.evaluate(() => document.getElementById('tmode-all')?.classList.contains('active'));
    assert('Transit HUD mode switch back to [Alle] functions', !!allIsActiveAgain);

    // 7. Test Line Selector Pills & Inspector Drawer
    const linePill1 = await page.$('.tline-pill[data-line="1"]');
    assert('Line 1 Pill exists', !!linePill1);

    if (linePill1) {
      await linePill1.click();
      await page.waitForTimeout(1000);

      const inspectorVisible = await page.evaluate(() => {
        const d = document.getElementById('line-inspector-drawer');
        return d && d.style.display !== 'none';
      });
      assert('Linien-Inspektor Drawer opens on Line Pill click', inspectorVisible);

      const inspectorTitle = await page.textContent('#insp-line-title');
      assert('Linien-Inspektor displays correct line title (Linie 1)', inspectorTitle.includes('1'));

      const stationCountText = await page.textContent('#insp-station-count');
      const stationCount = parseInt(stationCountText) || 0;
      assert(`Linien-Inspektor lists all ${stationCount} stations in timeline`, stationCount >= 10);

      // Close inspector
      await page.click('#insp-close-btn');
      await page.waitForTimeout(500);
      const inspectorClosed = await page.evaluate(() => document.getElementById('line-inspector-drawer').style.display === 'none');
      assert('Linien-Inspektor closes properly on close button', inspectorClosed);
    }

    // 8. Test Navigation Tabs Switching
    // Departures
    await page.click('#tab-btn-departures');
    await page.waitForTimeout(800);
    assert('Tab switch to Abfahrten displays active feed', await page.isVisible('#sidebar-feed-departures.active'));

    // Emergencies
    await page.click('#tab-btn-emergencies');
    await page.waitForTimeout(800);
    assert('Tab switch to Blaulicht displays active feed', await page.isVisible('#sidebar-feed-emergencies.active'));

    // Bikes
    await page.click('#tab-btn-bikes');
    await page.waitForTimeout(800);
    assert('Tab switch to KVB-Rad displays active feed', await page.isVisible('#sidebar-feed-bikes.active'));

    // Routes
    await page.click('#tab-btn-routes');
    await page.waitForTimeout(800);
    assert('Tab switch to Routenplaner displays active feed', await page.isVisible('#sidebar-feed-routes.active'));

    // Disruptions
    await page.click('#tab-btn-disruptions');
    await page.waitForTimeout(800);
    assert('Tab switch to Störungen displays active feed', await page.isVisible('#sidebar-feed-disruptions.active'));

    // Analytics
    await page.click('#tab-btn-analytics');
    await page.waitForTimeout(800);
    assert('Tab switch to Analytics displays active feed', await page.isVisible('#sidebar-feed-analytics.active'));

    // Widgets
    await page.click('#tab-btn-widgets');
    await page.waitForTimeout(800);
    assert('Tab switch to Widgets displays active feed', await page.isVisible('#sidebar-feed-widgets.active'));

    // Switch back to Map
    await page.click('#brand-home-btn');
    await page.waitForTimeout(800);
    assert('Switch back to Map displays live radar feed', await page.isVisible('#sidebar-feed-radar.active'));

    // 9. Check Console Errors
    assert(`Zero runtime JavaScript errors in browser (errors: ${consoleErrors.length})`, consoleErrors.length === 0);
    if (consoleErrors.length > 0) {
      console.warn('Recorded console errors:', consoleErrors);
    }

    // Capture Desktop Screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'e2e_desktop_verified.png'), fullPage: false });
    console.log(`\n📸 Captured desktop verification screenshot to ${path.join(SCREENSHOTS_DIR, 'e2e_desktop_verified.png')}`);

  } catch (err) {
    console.error('Fatal E2E error:', err);
  } finally {
    await browser.close();
  }

  console.log('\n=====================================================================');
  console.log(`📊 E2E Test Results: ${passed}/${total} Passed (${Math.round((passed/total)*100)}%)`);
  console.log('=====================================================================\n');

  if (passed === total) {
    console.log('🎉 ALL END-TO-END BROWSER TESTS PASSED PERFECTLY!');
    process.exit(0);
  } else {
    console.error('⚠️ SOME E2E TESTS FAILED!');
    process.exit(1);
  }
}

runCompleteE2ETests().catch(err => {
  console.error(err);
  process.exit(1);
});
