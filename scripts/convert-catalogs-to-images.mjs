// This script converts catalog_pages from raw PDF to PNG/JPEG preview images.
// It downloads the single PDF page from Google Drive, opens it locally in Chrome via Puppeteer (which handles complex fonts beautifully),
// takes a screenshot, and uploads the high-quality JPEG to Google Drive.

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import os from 'os';
import puppeteer from 'puppeteer';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'supabase/functions/.env' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

// Google Drive configuration
const SCOPES = ['https://www.googleapis.com/auth/drive'];
const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_SA_EMAIL,
        private_key: process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
});
const drive = google.drive({ version: 'v3', auth });

const CATALOG_IMAGE_FOLDER_ID = process.env.VITE_CATALOG_IMAGES_FOLDER_ID;

// Use OS temp dir
const TEMP_DIR = os.tmpdir();

async function processCatalogPages() {
    console.log('=== STARTING CATALOG TO IMAGE CONVERSION (PUPPETEER CHROME PDF RENDERER) ===');

    if (!CATALOG_IMAGE_FOLDER_ID) {
        console.error('ERROR: VITE_CATALOG_IMAGES_FOLDER_ID is not set in .env.local');
        process.exit(1);
    }

    const browser = await puppeteer.launch({ headless: 'new' });

    // Process forever until no more pages
    while (true) {
        // Find pages that HAVE a drive_file_id BUT DO NOT HAVE page_image_url
        const { data: pages, error } = await supabase.from('catalog_pages')
            .select('id, drive_file_id, page_image_url')
            .not('drive_file_id', 'is', null)
            .or('page_image_url.is.null,page_image_url.eq.https://lh3.googleusercontent.com/d/undefined')
            .limit(50);

        if (error) {
            console.error('Failed to fetch catalog pages:', error);
            break;
        }

        if (pages.length === 0) {
            console.log('No more pages to convert. Exiting.');
            break;
        }

        console.log(`Found ${pages.length} pages in this batch.`);

        for (const page of pages) {
            const { id, drive_file_id } = page;
            console.log(`\n[${id}] Starting process for Drive ID: ${drive_file_id}`);

            const tempPdf = path.join(TEMP_DIR, `temp_${id}.pdf`);
            const tempJpg = path.join(TEMP_DIR, `temp_${id}.jpg`);

            try {
                // 1. Download PDF form Google Drive
                console.log(`[${id}] Downloading PDF...`);
                const res = await drive.files.get({ fileId: drive_file_id, alt: 'media' }, { responseType: 'stream' });

                await new Promise((resolve, reject) => {
                    const dest = fs.createWriteStream(tempPdf);
                    res.data
                       .on('end', () => resolve())
                       .on('error', err => reject(err))
                       .pipe(dest);
                });

                // 2. Rasterize using Chrome PDFium via Puppeteer
                console.log(`[${id}] Rasterizing PDF via Puppeteer...`);
                const puppeteerPage = await browser.newPage();
                // Set viewport to a good A4 portrait size
                await puppeteerPage.setViewport({ width: 1200, height: 1697 });
                const pdfUrl = "file://" + tempPdf;
                await puppeteerPage.goto(pdfUrl, { waitUntil: 'networkidle0' });
                // Wait for the built-in PDF viewer to fully render the canvas
                await new Promise(r => setTimeout(r, 2000));
                
                await puppeteerPage.screenshot({ path: tempJpg, type: 'jpeg', quality: 90, fullPage: true });
                await puppeteerPage.close();
                
                const stat = fs.statSync(tempJpg);
                console.log(`[${id}] Rasterization complete (${stat.size} bytes). Uploading...`);

                // 3. Upload to Google Drive
                const filename = `catalog_${id.substring(0, 8)}.jpg`;
                const media = {
                    mimeType: 'image/jpeg',
                    body: fs.createReadStream(tempJpg),
                };

                const uploadRes = await drive.files.create({
                    requestBody: {
                        name: filename,
                        parents: [CATALOG_IMAGE_FOLDER_ID]
                    },
                    media: media,
                    fields: 'id',
                    supportsAllDrives: true
                });

                const newFileId = uploadRes.data.id;
                
                console.log(`[${id}] Updating permissions...`);
                await drive.permissions.create({
                    fileId: newFileId,
                    requestBody: { role: 'reader', type: 'anyone' },
                    supportsAllDrives: true
                });

                // 4. Update Database with direct LH3 URL
                const newDriveUrl = `https://lh3.googleusercontent.com/d/${newFileId}=w1600`;
                console.log(`[${id}] Success! LH3 URL: ${newDriveUrl}`);

                await supabase.from('catalog_pages')
                    .update({ page_image_url: newDriveUrl })
                    .eq('id', id);

            } catch (err) {
                console.error(`[${id}] ERROR:`, err.message);
            } finally {
                // Cleanup temp files
                if (fs.existsSync(tempPdf)) fs.unlinkSync(tempPdf);
                if (fs.existsSync(tempJpg)) fs.unlinkSync(tempJpg);
            }
        }
    }

    await browser.close();
    console.log('\n=== PROCESS COMPLETED ===');
}

processCatalogPages();
