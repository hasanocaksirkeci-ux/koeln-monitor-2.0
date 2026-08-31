import puppeteer from 'puppeteer-core';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1000));

  // Click on Köln AI rail tab
  await page.click('#tab-btn-ai');
  await new Promise(r => setTimeout(r, 600));

  // Type route query
  await page.type('#ai-chat-input', 'Zeige mir die Route von Florastr. zum Neumarkt auf der Karte');
  await page.click('#ai-chat-form button[type="submit"]');

  // Wait for AI response
  await new Promise(r => setTimeout(r, 2000));

  await page.screenshot({ path: join(__dirname, 'screenshots', '07_ai_route_chat_response.png') });
  console.log('Saved 07_ai_route_chat_response.png');

  await browser.close();
}

main().catch(err => {
  console.error('Error in test_ai_visual.js:', err);
  process.exit(1);
});
