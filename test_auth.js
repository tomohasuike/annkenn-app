import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'supabase/functions/.env', override: true });

async function check() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_SA_EMAIL,
        private_key: process.env.GOOGLE_SA_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  const drive = google.drive({ version: 'v3', auth });
  try {
     const res = await drive.files.get({ fileId: process.env.VITE_CATALOG_IMAGES_FOLDER_ID });
     console.log('Exists:', res.status);
  } catch(e) {
     console.error('Error:', e.message);
  }
}
check();
