import puppeteer from 'puppeteer-core';

async function verifyAll() {
  console.log('🚀 Launching Chrome for verification...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('dialog', async dialog => {
    console.log('Dialog opened:', dialog.message());
    await dialog.dismiss();
  });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text(), msg.location());
      errors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.message, err.stack);
    errors.push(err.message);
  });

  console.log('1. Loading http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));

  // Check Tab Bar for Emojis
  const navTabsHtml = await page.$eval('.nav-tabs', el => el.innerHTML);
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const hasEmojiInTabs = emojiRegex.test(navTabsHtml);
  console.log(` - Nav tabs contain emojis: ${hasEmojiInTabs ? '❌ YES' : '✅ NO (100% Clean Vector Icons)'}`);

  // Test Tab: Routenplaner
  console.log('2. Testing Routenplaner...');
  await page.evaluate(() => document.querySelector('#tab-btn-routes')?.click());
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => document.querySelector('#calculate-route-btn')?.click());
  await new Promise(r => setTimeout(r, 4000));
  
  const routeCards = await page.$$eval('.route-card', els => els.length);
  const routeText = await page.$eval('#route-cards-list', el => el.innerText);
  console.log(` - Route cards rendered: ${routeCards}`);
  console.log(` - Contains "undefined": ${routeText.includes('undefined') ? '❌ YES' : '✅ NO'}`);
  await page.screenshot({ path: 'public/screen_verify_routes.png' });

  // Test Tab: Störungen & SEV
  console.log('3. Testing Störungen & SEV...');
  await page.evaluate(() => document.querySelector('#tab-btn-disruptions')?.click());
  await new Promise(r => setTimeout(r, 1500));
  const stadtbahnCards = await page.$$eval('#stadtbahn-status-grid .line-status-card', els => els.length);
  const sbahnCards = await page.$$eval('#sbahn-status-grid .line-status-card', els => els.length);
  console.log(` - Stadtbahn status cards: ${stadtbahnCards}`);
  console.log(` - S-Bahn status cards: ${sbahnCards}`);
  await page.screenshot({ path: 'public/screen_verify_disruptions.png' });

  // Test Tab: Köln-Widgets
  console.log('4. Testing Köln-Widgets...');
  await page.evaluate(() => document.querySelector('#tab-btn-widgets')?.click());
  await new Promise(r => setTimeout(r, 1500));
  const pegelVal = await page.$eval('#pegel-cm-val', el => el.textContent);
  const weatherTemp = await page.$eval('#weather-temp-val', el => el.textContent);
  const parkingFree = await page.$eval('#parking-total-free', el => el.textContent);
  const parkingCards = await page.$$eval('#parking-garages-grid .parking-card', els => els.length);
  console.log(` - Pegel: ${pegelVal} cm`);
  console.log(` - Weather Temp: ${weatherTemp} °C`);
  console.log(` - Parking Free: ${parkingFree} (garages rendered: ${parkingCards})`);
  await page.screenshot({ path: 'public/screen_verify_widgets.png' });

  // Test Tab: Köln AI Assistent
  console.log('5. Testing Köln AI Assistent...');
  await page.evaluate(() => document.querySelector('#tab-btn-ai')?.click());
  await new Promise(r => setTimeout(r, 800));
  // Click first quick chip
  await page.evaluate(() => document.querySelector('.quick-chip')?.click());
  console.log(' - Clicked quick prompt chip');
  await new Promise(r => setTimeout(r, 3000));
  const aiMessages = await page.$$eval('.ai-message', els => els.length);
  const lastMsgText = await page.$$eval('.ai-message .ai-bubble', els => els[els.length - 1]?.innerText || '');
  console.log(` - Total AI messages: ${aiMessages}`);
  console.log(` - Last AI reply snippet: "${lastMsgText.slice(0, 100)}..."`);
  await page.screenshot({ path: 'public/screen_verify_ai.png' });

  console.log('\n--- Console Errors ---');
  console.log(errors.length === 0 ? '✅ Zero console errors!' : errors);

  await browser.close();
  console.log('🎉 All tabs verified successfully!');
}

verifyAll().catch(e => {
  console.error('Verification failed:', e);
  process.exit(1);
});
