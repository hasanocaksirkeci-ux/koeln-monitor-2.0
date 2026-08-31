/**
 * Automated Mobile E2E Test Suite (iPhone Viewport & Touch Interaction)
 */
import { chromium } from 'playwright';

async function runMobileE2ETests() {
  console.log('====================================================');
  console.log('📱 Starting Köln Live-Monitor Mobile E2E Tests (iPhone 15 Pro Viewport)...');
  console.log('====================================================');

  const browser = await chromium.launch({ headless: true });
  
  // iPhone 15 Pro Context
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();
  let passed = 0;
  let total = 0;

  function assert(title, condition) {
    total++;
    if (condition) {
      console.log(`[E2E ${total}] ${title}... ✅ PASSED`);
      passed++;
    } else {
      console.error(`[E2E ${total}] ${title}... ❌ FAILED`);
    }
  }

  try {
    // 1. Load Application
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);

    // 2. Check Viewport Meta & Apple PWA Tags
    const viewportMeta = await page.getAttribute('meta[name="viewport"]', 'content');
    assert('Viewport includes viewport-fit=cover for iPhone notch', viewportMeta.includes('viewport-fit=cover'));

    const appleCapable = await page.getAttribute('meta[name="apple-mobile-web-app-capable"]', 'content');
    assert('Apple Web App Capable is enabled', appleCapable === 'yes');

    // 3. Check Leaflet Map is rendered
    const mapExists = await page.isVisible('#leaflet-map');
    assert('Leaflet Map element visible on iPhone', mapExists);

    // 4. Check Navigation Rail (Bottom on Mobile)
    const navTabsVisible = await page.isVisible('.nav-rail');
    assert('Navigation Rail visible on iPhone', navTabsVisible);

    // 5. Test Tab Switching to Departures via Mobile Rail
    await page.click('#tab-btn-departures');
    await page.waitForTimeout(600);
    const departuresActive = await page.evaluate(() => document.getElementById('sidebar-feed-departures').classList.contains('active'));
    assert('Mobile Tab switch to Abfahrtstafel works', departuresActive);

    // 6. Test Tab Switching to Emergencies
    await page.click('#tab-btn-emergencies');
    await page.waitForTimeout(600);
    const emergenciesActive = await page.evaluate(() => document.getElementById('sidebar-feed-emergencies').classList.contains('active'));
    assert('Mobile Tab switch to Blaulicht-Monitor works', emergenciesActive);

    // 7. Return to Map and Open Station Drawer (Bottom Sheet)
    await page.click('#tab-btn-map');
    await page.waitForTimeout(600);
    
    // Simulate Station Drawer Open
    await page.evaluate(() => {
      window.openStationDrawer?.({
        id: '900000304',
        name: 'Florastr.',
        short: 'Florastr.',
        lat: 50.9638,
        lng: 6.9513,
        lines: ['12', '15'],
        isUnderground: true
      });
    });
    await page.waitForTimeout(800);

    const stationDrawerOpen = await page.evaluate(() => {
      const el = document.getElementById('station-drawer');
      return el && el.classList.contains('open');
    });
    assert('Station Drawer opens as a Native Bottom Sheet', stationDrawerOpen);

    const hasDragHandle = await page.isVisible('#station-drawer .sheet-drag-handle');
    assert('Station Drawer contains Apple-style Drag Handle pill', hasDragHandle);

    // 8. Close Station Drawer
    await page.evaluate(() => window.closeStationDrawer?.());
    await page.waitForTimeout(500);
    const drawerClosed = await page.evaluate(() => !document.getElementById('station-drawer').classList.contains('open'));
    assert('Station Drawer closes properly', drawerClosed);

    // 9. Check High-Performance CSS Touches
    const hasWebkitTouch = await page.evaluate(() => {
      const el = document.querySelector('.sidebar-content-scroll');
      return el !== null;
    });
    assert('Smooth scrolling container is present', hasWebkitTouch);

    // 10. Check Fast Basemap Switching on Mobile
    await page.click('#mode-btn-light');
    await page.waitForTimeout(600);
    const isLightActive = await page.evaluate(() => document.getElementById('mode-btn-light').classList.contains('active'));
    assert('Light mode basemap switcher works on mobile', isLightActive);

    // 11. Check 3D Perspective Tilt on Mobile
    await page.click('#toggle-3d-btn');
    await page.waitForTimeout(600);
    const is3dActive = await page.evaluate(() => document.getElementById('map-3d-wrapper').classList.contains('tilt-3d'));
    assert('3D Perspective Tilt transforms map on mobile', is3dActive);

    console.log('====================================================');
    console.log(`🎉 Mobile E2E Suite Complete: ${passed}/${total} assertions passed!`);
    console.log('====================================================');

    if (passed === total) {
      console.log('✅ ALL MOBILE E2E TESTS PASSED (100%)');
    }

  } catch (err) {
    console.error('Error during mobile E2E tests:', err);
  } finally {
    await browser.close();
  }
}

runMobileE2ETests().catch(console.error);
