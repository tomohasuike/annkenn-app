// 安否確認 自動送信スクリプト
// GitHub Actions から毎時呼び出される
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('環境変数が設定されていません');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// JST時刻を計算
const now = new Date();
const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
const month = String(jstDate.getUTCMonth() + 1);
const date = String(jstDate.getUTCDate());
const hour = String(jstDate.getUTCHours()).padStart(2, '0');
const minute = String(jstDate.getUTCMinutes()).padStart(2, '0');
const currentTime = `${hour}:${minute}`;

console.log(`[JST] ${month}月${date}日 ${currentTime} - 安否確認スケジュールチェック開始`);

// app_settings 取得
const { data: settings, error: settingsErr } = await supabase
  .from('app_settings')
  .select('*')
  .limit(1)
  .single();

if (settingsErr || !settings) {
  console.error('設定の取得に失敗:', settingsErr?.message);
  process.exit(1);
}

// 自動送信が無効の場合はスキップ
if (!settings.enable_auto_test) {
  console.log('自動送信は無効 (enable_auto_test = false)');
  process.exit(0);
}

// スケジュールを解析
let schedule = {};
try {
  schedule = typeof settings.auto_test_schedule === 'string'
    ? JSON.parse(settings.auto_test_schedule)
    : (settings.auto_test_schedule || {});
} catch {
  console.error('スケジュールのJSON解析に失敗');
  process.exit(1);
}

const monthSchedules = schedule[month] || [];
console.log(`${month}月のスケジュール:`, JSON.stringify(monthSchedules));

const match = monthSchedules.find(s => s.date === date && s.time === currentTime);

if (!match) {
  console.log(`一致なし: ${month}/${date} ${currentTime} はスケジュール対象外`);
  process.exit(0);
}

console.log(`スケジュール一致! ${month}/${date} ${currentTime} - 送信処理を開始`);

// 2時間以内に既に送信済みか確認（二重送信防止）
const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
const { data: recentSent } = await supabase
  .from('safety_notification_history')
  .select('id, sent_at')
  .gte('sent_at', twoHoursAgo)
  .limit(1);

if (recentSent && recentSent.length > 0) {
  console.log('2時間以内に既に送信済み - スキップ');
  process.exit(0);
}

// Google Chat に送信
const formUrl = settings.safety_app_url || 'https://annkenn-app.vercel.app/safety-report';
const messageText = [
  '<users/all> 【定期訓練】安否確認のお願い',
  '定期安否確認訓練です。以下のURLより状況をご報告ください。',
  '',
  formUrl
].join('\n');

console.log('Google Chat に送信中...');
const res = await fetch(settings.safety_webhook_url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: messageText }),
});

if (!res.ok) {
  const errText = await res.text();
  console.error('Google Chat 送信失敗:', res.status, errText);
  process.exit(1);
}

// 送信履歴を記録
const { error: insertErr } = await supabase
  .from('safety_notification_history')
  .insert([{ type: 'test_auto' }]);

if (insertErr) {
  console.error('履歴の記録に失敗:', insertErr.message);
  // 送信自体は成功しているので終了コードは0
} else {
  console.log('送信履歴を記録しました');
}

console.log(`完了: ${month}/${date} ${currentTime} JST 自動送信成功`);
