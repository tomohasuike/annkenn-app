import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { PDFDocument } from 'pdf-lib';
import { PDFParse } from 'pdf-parse';

// === 設定 ==========================================
dotenv.config({ path: '.env.local' });
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const functionsEnvPath = path.resolve('./supabase/functions/.env');
if (fs.existsSync(functionsEnvPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(functionsEnvPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
}

const GOOGLE_SA_EMAIL = process.env.GOOGLE_SA_EMAIL;
const GOOGLE_SA_PRIVATE_KEY = (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const TARGET_FOLDER_ID = process.env.VITE_CATALOG_IMAGES_FOLDER_ID || '185swK8kWHsCWXrB3R22vW4_DuGDxau_1';

const BASE_DIR = '/Users/hasuiketomoo/Downloads/カタログ';
const PROGRESS_FILE = path.resolve('./ingest_all_progress.json');

// マップ定義（メーカー名とカタログ名）
const CATALOG_MAP = {
    '2025_1mirai.pdf': { manufacturer: '未来工業', catalog_name: '総合カタログ2025' },
    'catalog_densetsu-kai.pdf': { manufacturer: 'ネグロス電工', catalog_name: '電設一般カタログ' },
    'catalog_taflock-kai.pdf': { manufacturer: 'ネグロス電工', catalog_name: 'タフロック' },
    'fujidenki62D2-J-0030f_web_1952nq3img.pdf': { manufacturer: '富士電機', catalog_name: 'Webカタログ' },
    'idec-SJPJA01B.pdf': { manufacturer: 'IDEC', catalog_name: 'SJPJA01B' },
    'kanro_zenbun-rurukawa.pdf': { manufacturer: '古河電気工業', catalog_name: '管路カタログ' },
    'mitsubisi-catalog.pdf': { manufacturer: '三菱電機', catalog_name: '総合カタログ' },
    'naigai0447_20240701.pdf': { manufacturer: '内外電機', catalog_name: '総合カタログ2024' },
    'nitto-SK-25A.pdf': { manufacturer: '日東工業', catalog_name: 'SK-25A' }
};

let driveService = null;
let currentServer = null;

async function initGoogleDrive() {
    console.log("Initializing Google Drive API...");
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: GOOGLE_SA_EMAIL, private_key: GOOGLE_SA_PRIVATE_KEY },
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    driveService = google.drive({ version: 'v3', auth });
}

async function uploadImageToDrive(fileName, localFilePath) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await driveService.files.create({
                resource: { name: fileName, parents: [TARGET_FOLDER_ID] },
                media: { mimeType: 'image/jpeg', body: fs.createReadStream(localFilePath) },
                fields: 'id',
                supportsAllDrives: true
            });
            // パーミッションは親フォルダが共有状態なら自動で継承されるため、個別のAPIコールを削除してレートリミットを回避
            return res.data.id;
        } catch (err) {
            console.log(`  -> Drive Upload error. Attempt ${attempt}/3 : ${err.message}`);
            await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
    throw new Error("Failed to upload after 3 attempts");
}

function startPdfServer(pdfPath) {
    return new Promise((resolve) => {
        if (currentServer) {
            currentServer.close();
            currentServer = null;
        }
        currentServer = http.createServer((req, res) => {
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
                
                res.writeHead(206, {
                    'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'application/pdf'
                });
                fs.createReadStream(pdfPath, {start, end}).pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': total,
                    'Content-Type': 'application/pdf',
                    'Accept-Ranges': 'bytes'
                });
                fs.createReadStream(pdfPath).pipe(res);
            }
        });

        currentServer.listen(9876, () => {
            resolve();
        });
    });
}

function stopPdfServer() {
    if (currentServer) {
        currentServer.close();
        currentServer = null;
    }
}

async function renderPageToImage(browser, pageNum, outputPath) {
    const page = await browser.newPage();
    try {
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
                        const page = await pdf.getPage(${pageNum});
                        
                        const scale = 2.0; 
                        const viewport = page.getViewport({ scale: scale });
                        
                        const canvas = document.getElementById('pdf-canvas');
                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        
                        await page.render({ canvasContext: context, viewport: viewport, background: 'white' }).promise;
                        window.renderFinished = true;
                    } catch(e) {
                        window.renderError = e.message;
                    }
                }
                render();
            </script>
          </body>
        </html>
        `;

        await page.setContent(html, { waitUntil: 'load' });
        await page.waitForFunction('window.renderFinished === true || window.renderError', { timeout: 45000 });
        
        const error = await page.evaluate(() => window.renderError);
        if (error) throw new Error(error);

        const canvasElement = await page.$('canvas');
        await canvasElement.screenshot({ path: outputPath, type: 'jpeg', quality: 90 });
    } finally {
        await page.close();
    }
}

async function uploadFileToDrive(fileName, localFilePath, mimeType) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const res = await driveService.files.create({
                resource: { name: fileName, parents: [TARGET_FOLDER_ID] },
                media: { mimeType: mimeType, body: fs.createReadStream(localFilePath) },
                fields: 'id',
                supportsAllDrives: true
            });
            // パーミッション自動継承により個別付与APIを省略（レートリミット回避）
            return res.data.id;
        } catch (err) {
            console.log(`  -> Drive Upload error. Attempt ${attempt}/3 : ${err.message}`);
            await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
    throw new Error("Failed to upload after 3 attempts");
}

async function processAll() {
    console.log("🚀 完全画像化 + 1ページPDFハイブリッドバッチ処理を開始します...");
    await initGoogleDrive();

    let progress = {};
    if (fs.existsSync(PROGRESS_FILE)) {
        progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }

    const browser = await puppeteer.launch({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true
    });

    const files = fs.readdirSync(BASE_DIR).filter(f => f.toLowerCase().endsWith('.pdf'));

    for (const file of files) {
        const filePath = path.join(BASE_DIR, file);
        const mapping = CATALOG_MAP[file] || { manufacturer: '不明', catalog_name: file.replace('.pdf', '') };
        
        await supabase.from('manufacturers').upsert({ name: mapping.manufacturer }, { onConflict: 'name', ignoreDuplicates: true });

        console.log(`\n======================================`);
        console.log(`📂 対象ファイル: ${file}`);
        console.log(`🏭 メーカー: ${mapping.manufacturer} | カタログ: ${mapping.catalog_name}`);
        
        let totalPages = 0;
        let pdfDoc;
        try {
            const pdfBytes = fs.readFileSync(filePath);
            pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
            totalPages = pdfDoc.getPageCount();
        } catch (e) {
            console.error(`❌ PDF読み込みエラー ${file}:`, e.message);
            continue;
        }

        console.log(`📄 総ページ数: ${totalPages}`);

        await startPdfServer(filePath);

        progress[file] = progress[file] || {};

        for (let i = 1; i <= totalPages; i++) {
            if (progress[file][i]) {
                process.stdout.write(`⏭️ ${i} `);
                continue;
            }

            console.log(`\n[${file}]⏳ ページ ${i}/${totalPages} 抽出中...`);
            const localImgPath = `/tmp/render_${Date.now()}.jpg`;
            const localPdfPath = `/tmp/render_${Date.now()}.pdf`;
            
            try {
                // 1. JPEG抽出とアップロード
                await renderPageToImage(browser, i, localImgPath);
                const imgDriveFileId = await uploadFileToDrive(`${mapping.manufacturer}_${mapping.catalog_name}_p${i}.jpg`, localImgPath, 'image/jpeg');
                
                // 2. 単一PDF抽出とアップロード
                const singlePageDoc = await PDFDocument.create();
                const [copiedPage] = await singlePageDoc.copyPages(pdfDoc, [i - 1]);
                singlePageDoc.addPage(copiedPage);
                const singlePageBytes = await singlePageDoc.save();
                fs.writeFileSync(localPdfPath, singlePageBytes);
                const pdfDriveFileId = await uploadFileToDrive(`${mapping.manufacturer}_${mapping.catalog_name}_p${i}.pdf`, localPdfPath, 'application/pdf');

                const imageUrl = `https://drive.google.com/uc?export=download&id=${imgDriveFileId}`;

                // 2.5: pdf-parseでテキストを抽出
                let pageText = "";
                try {
                    const parser = new PDFParse({ data: singlePageBytes });
                    const result = await parser.getText();
                    // 余分な改行や空白を除去
                    pageText = result.text.replace(/\s+/g, ' ').trim();
                } catch(pe) {
                    console.log(`  -> Text extraction skipped/failed: ${pe.message}`);
                }

                // 3. Supabaseに登録 (画像とPDF両方のキー, 抽出したページテキストを保存)
                const { error: dbErr } = await supabase.from('catalog_pages').upsert({
                    manufacturer: mapping.manufacturer,
                    catalog_name: mapping.catalog_name,
                    page_number: i,
                    drive_file_id: imgDriveFileId,
                    page_image_url: imageUrl,
                    pdf_drive_file_id: pdfDriveFileId,
                    page_text: pageText
                }, { onConflict: 'manufacturer,catalog_name,page_number' });

                if (dbErr) {
                    throw new Error(`DB Error: ${dbErr.message}`);
                }

                console.log(`  ✅ 成功: ImageDriveID=${imgDriveFileId}, PdfDriveID=${pdfDriveFileId}`);
                
                progress[file][i] = true;
                fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
                
                fs.unlinkSync(localImgPath);
                fs.unlinkSync(localPdfPath);

            } catch (err) {
                console.error(`  ❌ 失敗 (ページ ${i}):`, err.message);
                if (fs.existsSync(localImgPath)) fs.unlinkSync(localImgPath);
                if (fs.existsSync(localPdfPath)) fs.unlinkSync(localPdfPath);
            }
        }
        
        stopPdfServer();
    }

    await browser.close();
    console.log("\n🎉 すべての完了しました！");
}

processAll().catch(console.error);
