import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  const outDir = path.resolve(process.cwd(), 'screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Dark Mode Map
  await page.screenshot({ path: path.join(outDir, '01_vexto_dark_map.png'), fullPage: false });
  console.log('Saved 01_vexto_dark_map.png');

  // 2. Switch to Light Mode Map
  await page.click('#mode-btn-light');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '02_vexto_light_map.png'), fullPage: false });
  console.log('Saved 02_vexto_light_map.png');

  // 3. Switch to Satellite Mode Map
  await page.click('#mode-btn-satellite');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '03_vexto_satellite_map.png'), fullPage: false });
  console.log('Saved 03_vexto_satellite_map.png');

  // 4. Switch to Dark Mode and Open 3D Tilt
  await page.click('#mode-btn-dark');
  await page.click('#toggle-3d-btn');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, '04_vexto_3d_tilt.png'), fullPage: false });
  console.log('Saved 04_vexto_3d_tilt.png');

  // 5. Open AI Concierge Drawer
  await page.click('#toggle-3d-btn'); // Untilt
  await page.click('#map-ai-trigger-btn');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, '05_vexto_ai_concierge.png'), fullPage: false });
  console.log('Saved 05_vexto_ai_concierge.png');

  await browser.close();
  console.log('All screenshots captured successfully!');
}

captureScreenshots().catch(console.error);
