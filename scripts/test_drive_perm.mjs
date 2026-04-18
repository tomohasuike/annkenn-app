import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: "supabase/functions/.env" });

const auth = new google.auth.GoogleAuth({
  credentials: {
      client_email: process.env.GOOGLE_SA_EMAIL,
      private_key: process.env.GOOGLE_SA_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

async function test() {
  try {
    const res = await drive.permissions.list({ fileId: '1mWw4t30gimiz7pi0137vWwr-YgOwW0CG', supportsAllDrives: true });
    console.log(res.data.permissions);
  } catch (e) { console.error(e.message); }
}
test();
