import puppeteer from 'puppeteer-core';
import fs from 'fs';

(async () => {
    const browser = await puppeteer.launch({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true
    });
    
    const page = await browser.newPage();
    
    const localPdfPath = "file:///Users/hasuiketomoo/Downloads/catalog_densetsu-kai.pdf";
    const pageNum = 41;
    
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
        <canvas id="pdf-canvas"></canvas>
        <script>
            async function render() {
                try {
                    const loadingTask = pdfjsLib.getDocument('${localPdfPath}');
                    const pdf = await loadingTask.promise;
                    const page = await pdf.getPage(${pageNum});
                    
                    const scale = 2.0; 
                    const viewport = page.getViewport({ scale: scale });
                    
                    const canvas = document.getElementById('pdf-canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    
                    const renderContext = {
                        canvasContext: context,
                        viewport: viewport,
                        background: 'white'
                    };
                    
                    await page.render(renderContext).promise;
                    window.renderFinished = true;
                } catch(e) {
                    console.error("RENDER ERR:", e);
                }
            }
            render();
        </script>
      </body>
    </html>
    `;

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    await page.setContent(html, { waitUntil: 'load' });
    
    await page.waitForFunction('window.renderFinished === true', { timeout: 30000 });
    
    const canvasElement = await page.$('canvas');
    await canvasElement.screenshot({ path: '/tmp/test_local_pdf.jpg', type: 'jpeg', quality: 90 });
    
    console.log('Puppeteer Screenshot saved to /tmp/test_local_pdf.jpg');
    console.log('Size:', fs.statSync('/tmp/test_local_pdf.jpg').size);
    await browser.close();
})();
