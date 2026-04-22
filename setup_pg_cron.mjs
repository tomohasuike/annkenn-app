// Supabase pg_cron セットアップスクリプト
// pg_cron と pg_net が使えるかテストし、Edge Function 呼び出しジョブを登録する
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_ID = 'gfkrwtlqqflkblqbzpvn';

// Direct SQL via Supabase pg_graphql or SQL API
async function execSQL(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ query: sql })
  });
  return { status: res.status, body: await res.text() };
}

// Use fetch to the SQL over HTTP endpoint (Supabase has this undocumented)
async function runQueryViaAPI(sql) {
  const res = await fetch(`https://${PROJECT_ID}.supabase.co/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    body: JSON.stringify({ query: sql })
  });
  return { status: res.status, body: await res.text() };
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log('=== pg_cron/pg_net セットアップ ===\n');

  // Step 1: Check if pg_cron is available by trying to use it
  console.log('1. pg_cron 拡張の確認...');
  const { data: cronCheck, error: cronErr } = await sb.schema('cron').from('job').select('jobid, schedule, command').limit(5);
  if (cronErr) {
    console.log('  pg_cron未インストール:', cronErr.message);
  } else {
    console.log('  pg_cron既インストール! 現在のジョブ:');
    cronCheck?.forEach(j => console.log(`  - ${j.jobid}: ${j.schedule} | ${j.command?.slice(0,80)}`));
  }

  // Step 2: Check if pg_net is available
  console.log('\n2. pg_net 拡張の確認...');
  const { data: netCheck, error: netErr } = await sb.schema('net').from('http_request_queue').select('id').limit(1);
  if (netErr) {
    console.log('  pg_net未インストール:', netErr.message);
  } else {
    console.log('  pg_net既インストール!');
  }
}

main().catch(console.error);
