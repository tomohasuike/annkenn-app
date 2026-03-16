const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', async msg => {
    const args = await Promise.all(msg.args().map(arg => arg.jsonValue()));
    console.log('PAGE LOG:', args);
  });
  
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  try {
    await page.goto('http://localhost:3001/work-summary', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 2000));
  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
  }
})();
