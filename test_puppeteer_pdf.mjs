import puppeteer from 'puppeteer';
import path from 'path';

async function run() {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    const pdfUrl = "file://" + path.resolve('test_page.pdf');
    await page.goto(pdfUrl, { waitUntil: 'networkidle0' });

    // In Chrome's PDF viewer, the PDF is displayed in an embed.
    // Wait a bit to ensure it's fully rendered
    await new Promise(r => setTimeout(r, 2000));

    await page.screenshot({ path: 'puppeteer_test.jpg', type: 'jpeg', quality: 90, fullPage: true });
    await browser.close();
    console.log("Screenshot written to puppeteer_test.jpg");
}
run();
