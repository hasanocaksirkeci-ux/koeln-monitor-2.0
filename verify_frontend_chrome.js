import puppeteer from 'puppeteer-core';
import { copyFileSync, existsSync } from 'fs';
import { join } from 'path';

const ARTIFACTS_DIR = 'C:\\Users\\hasan\\.gemini\\antigravity-ide\\brain\\8130bdb9-e2a8-42a2-8ce8-952446ea0c0b';

async function verify() {
  console.log('🚀 Launching Chrome for visual and UI verification...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('1. Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Check 1: Map loaded and vehicle count in header
  const vehicleCountText = await page.$eval('#vehicle-count-header', el => el.textContent);
  console.log(' - Header Vehicle Count:', vehicleCountText);

  // Check 2: Verify no "API KEY REQUIRED" text anywhere in the DOM or tile images
  const pageContent = await page.content();
  const hasWatermarkText = pageContent.includes('API KEY REQUIRED') || pageContent.includes('carto.com/basemaps/apikey');
  console.log(' - "API KEY REQUIRED" Watermark present?', hasWatermarkText ? '❌ YES (BAD)' : '✅ NO (CLEAN!)');

  // Screenshot 1: 2D Live Radar (Dark Canvas)
  const screen1Path = 'public/screen_1_live_radar_dark.png';
  await page.screenshot({ path: screen1Path });
  console.log(' - Saved Screenshot 1: Dark Mode Live Radar');

  // Check 3: Switch to 3D Drone Perspective Mode
  console.log('2. Testing 3D Drone Perspective Mode...');
  await page.click('#mm-3d');
  await new Promise(r => setTimeout(r, 1000));
  const is3DActive = await page.$eval('#leaflet-map', el => el.classList.contains('mode-3d'));
  console.log(' - 3D mode class active on map?', is3DActive ? '✅ YES' : '❌ NO');

  const screen3DPath = 'public/screen_2_3d_perspective.png';
  await page.screenshot({ path: screen3DPath });
  console.log(' - Saved Screenshot 2: 3D Drone Perspective Mode');

  // Check 4: Switch to High-Res Satellite / GPS View
  console.log('3. Testing High-Res Satellite / GPS Mode...');
  await page.click('#mm-satellite');
  await new Promise(r => setTimeout(r, 2000));
  const screenSatPath = 'public/screen_3_satellite_view.png';
  await page.screenshot({ path: screenSatPath });
  console.log(' - Saved Screenshot 3: High-Res Satellite View');

  // Switch back to Dark 2D for tab tests
  await page.click('#mm-dark');
  await new Promise(r => setTimeout(r, 500));

  // Check 5: Blaulicht-Monitor Tab
  console.log('4. Testing Blaulicht-Monitor Tab...');
  await page.click('#tab-btn-emergencies');
  await new Promise(r => setTimeout(r, 1000));
  const emCardsCount = await page.$$eval('.emergency-card', els => els.length);
  console.log(' - Emergency incident cards rendered:', emCardsCount);
  const screenEmPath = 'public/screen_4_blaulicht_monitor.png';
  await page.screenshot({ path: screenEmPath });
  console.log(' - Saved Screenshot 4: Blaulicht Monitor Tab');

  // Check 6: KVB-Rad Tab
  console.log('5. Testing KVB-Rad Tab...');
  await page.click('#tab-btn-bikes');
  await new Promise(r => setTimeout(r, 1000));
  const bikesAvailable = await page.$eval('#bikes-total-available', el => el.textContent);
  console.log(' - Total available bikes displayed:', bikesAvailable);
  const screenBikesPath = 'public/screen_5_kvb_bikes.png';
  await page.screenshot({ path: screenBikesPath });
  console.log(' - Saved Screenshot 5: KVB Rad Tab');

  // Check 7: Pünktlichkeit & Analytics Tab
  console.log('6. Testing Pünktlichkeit & Analytics Tab...');
  await page.click('#tab-btn-analytics');
  await new Promise(r => setTimeout(r, 1000));
  const punctualityVal = await page.$eval('#an-score-val', el => el.textContent);
  console.log(' - Network punctuality score:', punctualityVal);
  const screenAnPath = 'public/screen_6_analytics.png';
  await page.screenshot({ path: screenAnPath });
  console.log(' - Saved Screenshot 6: Analytics Tab');

  // Check 8: Abfahrtstafel Florastr.
  console.log('7. Testing Abfahrtstafel Tab...');
  await page.click('#tab-btn-departures');
  await new Promise(r => setTimeout(r, 1500));
  const activeStationTitle = await page.$eval('#active-station-name', el => el.textContent);
  console.log(' - Active Station Title:', activeStationTitle);
  const screenDepPath = 'public/screen_7_departures_florastr.png';
  await page.screenshot({ path: screenDepPath });
  console.log(' - Saved Screenshot 7: Florastraße Live Departures');

  await browser.close();

  // Copy screenshots to Artifacts Directory
  const filesToCopy = [
    'screen_1_live_radar_dark.png',
    'screen_2_3d_perspective.png',
    'screen_3_satellite_view.png',
    'screen_4_blaulicht_monitor.png',
    'screen_5_kvb_bikes.png',
    'screen_6_analytics.png',
    'screen_7_departures_florastr.png'
  ];

  for (const f of filesToCopy) {
    const src = join(process.cwd(), 'public', f);
    const dest = join(ARTIFACTS_DIR, f);
    if (existsSync(src)) {
      copyFileSync(src, dest);
    }
  }

  console.log('\n====================================================');
  console.log('🎉 ALL VISUAL AND FUNCTIONAL VERIFICATIONS COMPLETED!');
  console.log('====================================================');
}

verify().catch(e => {
  console.error('Verification error:', e);
  process.exit(1);
});
