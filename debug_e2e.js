import { chromium } from 'playwright';

async function debugE2E() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();

  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  console.log('--- Initial Class of #tmode-all ---');
  console.log(await page.evaluate(() => document.getElementById('tmode-all')?.className));
  console.log('--- Initial Class of #tmode-bus ---');
  console.log(await page.evaluate(() => document.getElementById('tmode-bus')?.className));

  console.log('--- Clicking #tmode-bus ---');
  await page.click('#tmode-bus');
  await page.waitForTimeout(500);

  console.log('--- After Click Class of #tmode-bus ---');
  console.log(await page.evaluate(() => document.getElementById('tmode-bus')?.className));
  console.log('--- After Click Class of #tmode-all ---');
  console.log(await page.evaluate(() => document.getElementById('tmode-all')?.className));

  console.log('--- Clicking Line Pill 1 ---');
  await page.click('.tline-pill[data-line="1"]');
  await page.waitForTimeout(1000);

  console.log('--- Line Inspector Drawer Style & HTML ---');
  const drawerInfo = await page.evaluate(() => {
    const d = document.getElementById('line-inspector-drawer');
    return {
      display: d ? d.style.display : 'NO_ELEMENT',
      title: document.getElementById('insp-line-title')?.textContent,
      stationCount: document.getElementById('insp-station-count')?.textContent,
      timelineItemsCount: document.querySelectorAll('#insp-timeline-list .timeline-station-item').length
    };
  });
  console.log('Drawer Info:', drawerInfo);

  await browser.close();
}

debugE2E().catch(console.error);
