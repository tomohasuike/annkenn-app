import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // We will inject PDF.js and render the PDF /tmp/test_download.pdf
    const pdfPath = '/tmp/test_download.pdf';
    const pdfDataUrl = 'data:application/pdf;base64,' + fs.readFileSync(pdfPath).toString('base64');

    const html = `
    <html>
      <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"></script>
        <script>
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        </script>
        <style>body, html { margin: 0; padding: 0; background: white; } canvas { display: block; }</style>
      </head>
      <body>
        <canvas id="the-canvas"></canvas>
        <script>
            window.renderFinished = false;
            const binaryString = atob("${pdfDataUrl}".split(',')[1]);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const loadingTask = pdfjsLib.getDocument({data: bytes});
            
            loadingTask.promise.then(function(pdf) {
                return pdf.getPage(1);
            }).then(function(page) {
                const viewport = page.getViewport({scale: 2.0});
                const canvas = document.getElementById('the-canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                return page.render(renderContext).promise;
            }).then(() => {
                window.renderFinished = true;
            }).catch(console.error);
        </script>
      </body>
    </html>
    `;

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err));

    await page.setContent(html, { waitUntil: 'load' });
    
    try {
        await page.waitForFunction('window.renderFinished === true', { timeout: 15000 });
    } catch(e) {
        console.log('Timeout waiting for render.');
    }
    
    const canvasElement = await page.$('canvas');
    await canvasElement.screenshot({ path: '/tmp/test_puppeteer.jpg', type: 'jpeg', quality: 90 });
    
    console.log('Puppeteer Screenshot saved to /tmp/test_puppeteer.jpg');
    console.log('Size:', fs.statSync('/tmp/test_puppeteer.jpg').size);
    await browser.close();
})();
