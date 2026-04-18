import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';

const pdfPath = '/Users/hasuiketomoo/Downloads/catalog_densetsu-kai.pdf';

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length');
    
    const stat = fs.statSync(pdfPath);
    const total = stat.size;
    
    if (req.headers.range) {
        const parts = req.headers.range.replace(/bytes=/, "").split("-");
        const partialstart = parts[0];
        const partialend = parts[1];

        const start = parseInt(partialstart, 10);
        const end = partialend ? parseInt(partialend, 10) : total - 1;
        const chunksize = (end - start) + 1;
        
        const file = fs.createReadStream(pdfPath, {start: start, end: end});
        res.writeHead(206, {
            'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'application/pdf'
        });
        file.pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': total,
            'Content-Type': 'application/pdf',
            'Accept-Ranges': 'bytes'
        });
        fs.createReadStream(pdfPath).pipe(res);
    }
});

server.listen(9876, async () => {
    console.log('Server running dynamically at 9876');
    try {
        const browser = await puppeteer.launch({
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: true
        });
        
        const page = await browser.newPage();
        
        const html = `
        <html>
          <head>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"></script>
            <script>pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';</script>
            <style>body, html { margin: 0; padding: 0; background: white; } canvas { display: block; }</style>
          </head>
          <body>
            <canvas id="pdf-canvas"></canvas>
            <script>
                async function render() {
                    try {
                        const loadingTask = pdfjsLib.getDocument('http://127.0.0.1:9876/pdf');
                        const pdf = await loadingTask.promise;
                        const page = await pdf.getPage(41);
                        
                        const scale = 2.0; 
                        const viewport = page.getViewport({ scale: scale });
                        
                        const canvas = document.getElementById('pdf-canvas');
                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        
                        await page.render({ canvasContext: context, viewport: viewport, background: 'white' }).promise;
                        window.renderFinished = true;
                    } catch(e) {
                        console.error(e);
                        window.renderError = e.message;
                    }
                }
                render();
            </script>
          </body>
        </html>
        `;

        await page.setContent(html, { waitUntil: 'load' });
        
        await page.waitForFunction('window.renderFinished === true || window.renderError', { timeout: 30000 });
        
        const error = await page.evaluate(() => window.renderError);
        if (error) {
            console.error("PAGE RENDER ERROR:", error);
        } else {
            const canvasElement = await page.$('canvas');
            await canvasElement.screenshot({ path: '/tmp/test_local_pdf.jpg', type: 'jpeg', quality: 90 });
            console.log('Screenshot saved to /tmp/test_local_pdf.jpg');
        }
        
        await browser.close();
    } catch(err) {
        console.error("Puppeteer ERR:", err);
    } finally {
        server.close();
    }
});
