import { chromium } from 'playwright';

async function testEdgeLaunch() {
  console.log('Testing Playwright launch with system browser (msedge / chrome)...');
  
  let browser = null;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    console.log('✅ Successfully launched Microsoft Edge via Playwright channel: msedge!');
  } catch (e1) {
    console.log('msedge launch failed:', e1.message);
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
      console.log('✅ Successfully launched Google Chrome via Playwright channel: chrome!');
    } catch (e2) {
      console.log('chrome launch failed:', e2.message);
    }
  }

  if (!browser) {
    console.log('Could not launch system browser channels.');
    process.exit(1);
  }

  const page = await browser.newPage();
  await page.goto('http://localhost:3000');
  const title = await page.title();
  console.log(`Page Title: "${title}"`);
  await browser.close();
  console.log('🎉 Browser test completed cleanly!');
}

testEdgeLaunch().catch(console.error);
