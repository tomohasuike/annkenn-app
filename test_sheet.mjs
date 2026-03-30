import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
const apiKey = process.env.VITE_GOOGLE_API_KEY;

async function check() {
  console.log('Checking API Key:', apiKey ? 'Loaded' : 'Missing');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/1cFCEzqG7hUibeTGLUtpmeNecMo0CRHADOt_2ReqtRhI?key=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.error('API Error:', data.error.message);
    } else {
      console.log('Success! Sheet title:', data.properties.title);
      data.sheets.forEach(s => console.log('Tab:', s.properties.title, s.properties.sheetId));
    }
  } catch(e) {
    console.error('Fetch exception:', e);
  }
}
check();
