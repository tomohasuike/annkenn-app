import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const functionsEnvPath = path.resolve('./supabase/functions/.env');
if (fs.existsSync(functionsEnvPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(functionsEnvPath));
    for (const k in envConfig) process.env[k] = envConfig[k];
}

const GOOGLE_SA_EMAIL = process.env.GOOGLE_SA_EMAIL;
const GOOGLE_SA_PRIVATE_KEY = (process.env.GOOGLE_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n');

async function fixMissing() {
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: GOOGLE_SA_EMAIL, private_key: GOOGLE_SA_PRIVATE_KEY },
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  const driveService = google.drive({ version: 'v3', auth });

  console.log("Drive API Initialized. Fetching files for pages 1-38...");
  const DENSETSU_FOLDER_ID = '1x8loyjC68AvVE8FVIlfh4Y-emGWIpQ5p'; // ID from previous logs

  let res = await driveService.files.list({
    q: `'${DENSETSU_FOLDER_ID}' in parents and trashed=false`, // we can fetch all and filter client side
    fields: 'files(id, name)', supportsAllDrives: true, includeItemsFromAllDrives: true, pageSize: 1000
  });

  const files = res.data.files;
  for (let file of files) {
      const match = file.name.match(/^page_(\d+)\.pdf$/);
      if (match) {
          const pageNum = parseInt(match[1]);
          if (pageNum <= 38) {
              const { error } = await supabase.from('catalog_pages').upsert({
                  manufacturer: 'ネグロス電工',
                  catalog_name: '電設一般カタログ',
                  page_number: pageNum,
                  drive_file_id: file.id
              }, { onConflict: 'manufacturer,catalog_name,page_number' });

              if (error) {
                  console.error(`Failed to patch page ${pageNum}:`, error.message);
              } else {
                  console.log(`✅ Patched page ${pageNum} with ID ${file.id}`);
              }
          }
      }
  }
  console.log("Done patching missing pages.");
}

fixMissing().catch(console.error);
