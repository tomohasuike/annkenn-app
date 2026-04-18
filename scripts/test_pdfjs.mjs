import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

async function run() {
    const pdfPath = path.resolve('test_page.pdf');
    const pdfData = fs.readFileSync(pdfPath).toString('base64');

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style> body, html { margin: 0; padding: 0; background: white; } canvas { display: block; } </style>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    </head>
    <body>
      <canvas id="the-canvas"></canvas>
      <script>
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        const pdfData = atob('${pdfData}');
        const cmapsUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/';
        const standardFontsUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/';
        
        async function render() {
          try {
              const loadingTask = pdfjsLib.getDocument({
                data: pdfData,
                cMapUrl: cmapsUrl,
                cMapPacked: true,
                standardFontDataUrl: standardFontsUrl
              });
              const pdf = await loadingTask.promise;
              const page = await pdf.getPage(1);
              
              const scale = 2.0;
              const viewport = page.getViewport({ scale: scale });
              
              const canvas = document.getElementById('the-canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              
              await page.render({ canvasContext: context, viewport: viewport }).promise;
              window.RENDER_COMPLETE = true;
          } catch (err) {
              window.RENDER_ERROR = err.message;
          }
        }
        render();
      </script>
    </body>
    </html>
    `;

    fs.writeFileSync('temp.html', html);
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.goto('file://' + path.resolve('temp.html'));
    await page.waitForFunction('window.RENDER_COMPLETE || window.RENDER_ERROR', { timeout: 30000 });

    const error = await page.evaluate(() => window.RENDER_ERROR);
    if (error) {
      console.error("PDFJS Error:", error);
    } else {
      const canvasElement = await page.$('canvas');
      await canvasElement.screenshot({ path: 'pdfjs_test.jpg', type: 'jpeg', quality: 90 });
      console.log("Success! Saved pdfjs_test.jpg");
    }
    await browser.close();
}

run().catch(console.error);
