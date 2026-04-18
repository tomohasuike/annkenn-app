import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { google } from 'googleapis';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'supabase/functions/.env' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_SA_EMAIL,
        private_key: process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
});
const drive = google.drive({ version: 'v3', auth });

async function testDriveToSips() {
    console.log("Fetching one un-imaged page...");
    const { data: pages } = await supabase.from('catalog_pages')
        .select('id, drive_file_id')
        .limit(1);

    if (!pages || pages.length === 0) return;
    const page = pages[0];

    const tempPdf = path.join(process.cwd(), `temp_${page.id}.pdf`);
    const tempJpg = path.join(process.cwd(), `temp_${page.id}.jpg`);

    console.log(`Downloading PDF ${page.drive_file_id} ...`);
    const res = await drive.files.get({ fileId: page.drive_file_id, alt: 'media' }, { responseType: 'stream' });

    await new Promise((resolve, reject) => {
        const dest = fs.createWriteStream(tempPdf);
        res.data
           .on('end', () => resolve())
           .on('error', err => reject(err))
           .pipe(dest);
    });

    console.log(`Downloaded to ${tempPdf}. Converting using sips...`);
    execSync(`sips -s format jpeg -s formatOptions 80 -z 1600 1130 "${tempPdf}" --out "${tempJpg}"`);

    console.log("Conversion complete! Checking size...");
    const stat = fs.statSync(tempJpg);
    console.log(`JPEG size: ${stat.size} bytes`);
    
    // Cleanup
    fs.unlinkSync(tempPdf);
    fs.unlinkSync(tempJpg);
}

testDriveToSips();
