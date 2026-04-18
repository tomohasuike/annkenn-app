import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: "supabase/functions/.env" });

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: process.env.GOOGLE_SA_EMAIL,
        private_key: process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
});
const drive = google.drive({ version: 'v3', auth });

async function test() {
  const fileMeta = await drive.files.get({
      fileId: '12OIh0iOujXYvK71a8z6NHs1vTojBZHkc', // A real pdf file id? Wait I need a valid PDF file ID from catalog_pages
      fields: 'thumbnailLink',
      supportsAllDrives: true
  });
  console.log(fileMeta.data);
}
test();
