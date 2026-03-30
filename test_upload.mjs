import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import fs from 'fs';

const base64png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
fs.writeFileSync('blank.png', Buffer.from(base64png, 'base64'));

const blob = new Blob([fs.readFileSync('blank.png')], { type: 'image/png' });
const formData = new FormData();
formData.append('file', blob, 'blank.png');

async function test() {
  try {
    const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/upload-drive-file`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`
      },
      body: formData
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

test();
