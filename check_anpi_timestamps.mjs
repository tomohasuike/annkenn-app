import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env.local') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('=== タイムスタンプ診断 ===\n');

  // 1. 通知履歴の sent_at を生の値で確認
  const { data: events } = await supabase
    .from('safety_notification_history')
    .select('id, type, sent_at')
    .order('sent_at', { ascending: false })
    .limit(3);

  console.log('【safety_notification_history.sent_at】');
  events?.forEach(e => {
    const raw = e.sent_at;
    const d = new Date(raw);
    console.log(`  生の値: "${raw}"`);
    console.log(`  末尾のZ有無: ${raw.endsWith('Z') ? 'あり(TIMESTAMPTZ)' : 'なし(TIMESTAMP/要Z付加)'}`);
    console.log(`  new Date() → UTC: ${d.toISOString()}`);
    console.log(`  JST変換後: ${new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z').toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
    console.log('');
  });

  // 2. 安否報告の created_at を確認
  const { data: reports } = await supabase
    .from('safety_reports')
    .select('id, created_at')
    .order('created_at', { ascending: false })
    .limit(3);

  console.log('\n【safety_reports.created_at】');
  reports?.forEach(r => {
    const raw = r.created_at;
    const d = new Date(raw);
    console.log(`  生の値: "${raw}"`);
    console.log(`  末尾のZ有無: ${raw.endsWith('Z') ? 'あり(TIMESTAMPTZ)' : 'なし(TIMESTAMP/要Z付加)'}`);
    console.log(`  new Date() → UTC: ${d.toISOString()}`);
    console.log(`  JST変換後: ${new Date(raw.endsWith('Z') || raw.includes('+') ? raw : raw + 'Z').toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
    console.log('');
  });
}

run().catch(console.error);
