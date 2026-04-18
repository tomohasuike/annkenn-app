/**
 * check_safety_db.mjs
 * 安否確認データの調査スクリプト
 * - .env.local の現行DB (gsczefdkcrvudddeotlx) の安否データを確認
 * - 旧DB (xofikctovjylpfxpmlzy) の安否データも確認して比較
 *
 * 実行: node check_safety_db.mjs
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env.local を読み込む
dotenv.config({ path: path.join(__dirname, '.env.local') });

// ────────────────────────────
// DB 接続情報
// ────────────────────────────
const NEW_URL  = process.env.VITE_SUPABASE_URL;
const NEW_KEY  = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const OLD_URL  = 'https://xofikctovjylpfxpmlzy.supabase.co';
// ※ 旧DBのAnon Keyは末尾に追記してください（なければスキップされます）
const OLD_KEY  = process.env.OLD_SUPABASE_ANON_KEY || '';

const LINE = '─'.repeat(60);

// ────────────────────────────
// 安否DBを調査する関数
// ────────────────────────────
async function checkSafetyData(label, url, key) {
  console.log(`\n${LINE}`);
  console.log(`📊 [${label}]`);
  console.log(`   URL: ${url}`);
  console.log(LINE);

  if (!url || !key) {
    console.log('   ⚠️  URLまたはKeyが未設定 → スキップ');
    return;
  }

  const sb = createClient(url, key);

  // 1. safety_notification_history
  const { data: events, error: eventsErr } = await sb
    .from('safety_notification_history')
    .select('id, type, sent_at')
    .order('sent_at', { ascending: false });

  if (eventsErr) {
    console.log(`   ❌ safety_notification_history 取得エラー: ${eventsErr.message}`);
  } else {
    console.log(`\n   📌 通知イベント履歴 (${events.length} 件)`);
    if (events.length === 0) {
      console.log('      （データなし）');
    } else {
      events.forEach(e => {
        const d = new Date(e.sent_at);
        const dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        console.log(`      - ${dateStr} [${e.type}] id=${e.id}`);
      });
    }
  }

  // 2. safety_reports の件数範囲
  const { data: reports, error: reportsErr } = await sb
    .from('safety_reports')
    .select('id, worker_id, status, created_at')
    .order('created_at', { ascending: false });

  if (reportsErr) {
    console.log(`\n   ❌ safety_reports 取得エラー: ${reportsErr.message}`);
  } else {
    console.log(`\n   📝 safety_reports 総件数: ${reports.length} 件`);
    if (reports.length > 0) {
      const newest = reports[0].created_at;
      const oldest = reports[reports.length - 1].created_at;
      console.log(`      最新: ${new Date(newest).toLocaleString('ja-JP')}`);
      console.log(`      最古: ${new Date(oldest).toLocaleString('ja-JP')}`);

      console.log(`\n   最新10件の回答:`);
      reports.slice(0, 10).forEach(r => {
        const d = new Date(r.created_at);
        const dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        console.log(`      - ${dateStr} status=${r.status} worker=${r.worker_id.substring(0,8)}...`);
      });
    }
  }

  // 3. app_settings の safety_app_url
  const { data: settings, error: settingsErr } = await sb
    .from('app_settings')
    .select('safety_app_url, safety_webhook_url')
    .limit(1)
    .single();

  if (settingsErr) {
    console.log(`\n   ❌ app_settings 取得エラー: ${settingsErr.message}`);
  } else {
    console.log(`\n   ⚙️  app_settings:`);
    console.log(`      safety_app_url    : ${settings?.safety_app_url || '（未設定 → フォールバック使用）'}`);
    console.log(`      safety_webhook_url: ${settings?.safety_webhook_url ? settings.safety_webhook_url.substring(0, 60) + '...' : '（未設定）'}`);
  }
}

// ────────────────────────────
// メイン実行
// ────────────────────────────
console.log('\n🔍 安否確認データベース調査を開始します...');
console.log('   現行DB (gsczefdkcrvudddeotlx) と 旧DB (xofikctovjylpfxpmlzy) を比較します\n');

await checkSafetyData('現行DB (gsczefdkcrvudddeotlx)', NEW_URL, NEW_KEY);
await checkSafetyData('旧DB (xofikctovjylpfxpmlzy)', OLD_URL, OLD_KEY);

console.log(`\n${LINE}`);
console.log('✅ 調査完了');
console.log(LINE);
console.log('\n📌 [確認ポイント]');
console.log('   1. 「旧DB」にエラーが出た場合: OLD_SUPABASE_ANON_KEY が不明（旧プロジェクトのSupabaseダッシュボードで確認）');
console.log('   2. 旧DBがスキップされた場合: Supabase管理画面で直接 xofikctovjylpfxpmlzy プロジェクトを確認してください');
console.log('   3. 現行DBの「safety_app_url」が旧URLを指していれば → それが原因です\n');
