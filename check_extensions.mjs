// Supabase REST API経由でSQLを実行するスクリプト
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env.local') });

const PROJECT_ID = 'gfkrwtlqqflkblqbzpvn';
const SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

async function runSQL(sql, description) {
  console.log(`\n[${description}]`);
  const res = await fetch(
    `https://${PROJECT_ID}.supabase.co/rest/v1/rpc/exec_sql`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text.slice(0, 200));
  return res.ok;
}

// pg_cron/pg_net が使えるかチェック
async function checkExtensions() {
  const res = await fetch(
    `https://${PROJECT_ID}.supabase.co/rest/v1/rpc/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ 
        sql: "SELECT name, installed_version FROM pg_available_extensions WHERE name IN ('pg_cron','pg_net') ORDER BY name;" 
      }),
    }
  );
  const text = await res.text();
  console.log('Extensions check:', res.status, text.slice(0, 300));
}

await checkExtensions();
