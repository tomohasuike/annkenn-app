const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  try {
    await page.goto('http://localhost:3001/work-summary', { waitUntil: 'networkidle2' });
    const html = await page.content();
    console.log(html.substring(0, 500));
    console.log('Contains text: ' + html.includes('作業集計管理'));
  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
  }
})();
