// 安否確認 自動送信スクリプト
// GitHub Actions から毎時呼び出される
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[FATAL] 環境変数が設定されていません (SUPABASE_URL / SUPABASE_SERVICE_KEY)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
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
    console.error('[ERROR] 設定の取得に失敗:', settingsErr?.message);
    console.error('[INFO] app_settings テーブルにデータが存在するか確認してください');
    // 設定取得失敗は制御不能なエラーなのでexit(0)でGitHub Actionsのエラーメールを止める
    process.exit(0);
  }

  console.log('[OK] 設定取得成功');

  // 自動送信が無効の場合はスキップ
  if (!settings.enable_auto_test) {
    console.log('[SKIP] 自動送信は無効 (enable_auto_test = false)');
    process.exit(0);
  }

  // Webhook URL チェック
  if (!settings.safety_webhook_url) {
    console.error('[ERROR] safety_webhook_url が未設定です。app_settings を確認してください。');
    process.exit(0);
  }

  // スケジュールを解析
  let schedule = {};
  try {
    schedule = typeof settings.auto_test_schedule === 'string'
      ? JSON.parse(settings.auto_test_schedule)
      : (settings.auto_test_schedule || {});
  } catch (e) {
    console.error('[ERROR] スケジュールのJSON解析に失敗:', e.message);
    console.error('[INFO] auto_test_schedule の値:', settings.auto_test_schedule);
    process.exit(0);
  }

  const monthSchedules = schedule[month] || [];
  console.log(`[INFO] ${month}月のスケジュール数: ${monthSchedules.length}件`);

  const match = monthSchedules.find(s => s.date === date && s.time === currentTime);

  if (!match) {
    console.log(`[SKIP] スケジュール対象外: ${month}/${date} ${currentTime}`);
    process.exit(0);
  }

  console.log(`[MATCH] スケジュール一致! ${month}/${date} ${currentTime} - 送信処理を開始`);

  // 2時間以内に既に送信済みか確認（二重送信防止）
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const { data: recentSent, error: recentErr } = await supabase
    .from('safety_notification_history')
    .select('id')
    .gte('created_at', twoHoursAgo)
    .limit(1);

  if (recentSent && recentSent.length > 0) {
    console.log('[SKIP] 2時間以内に既に送信済み - スキップ');
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

  console.log('[INFO] Google Chat に送信中...');
  let res;
  try {
    res = await fetch(settings.safety_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: messageText }),
    });
  } catch (fetchErr) {
    console.error('[ERROR] Webhook fetch 失敗 (URLが無効の可能性):', fetchErr.message);
    console.error('[INFO] safety_webhook_url:', settings.safety_webhook_url);
    process.exit(0);
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error('[ERROR] Google Chat 送信失敗:', res.status, errText);
    process.exit(0);
  }

  console.log('[OK] Google Chat 送信成功');

  // 送信履歴を記録
  const { error: insertErr } = await supabase
    .from('safety_notification_history')
    .insert([{ type: 'test_auto' }]);

  if (insertErr) {
    console.error('[WARN] 履歴の記録に失敗:', insertErr.message);
  } else {
    console.log('[OK] 送信履歴を記録しました');
  }

  console.log(`[DONE] ${month}/${date} ${currentTime} JST 自動送信完了`);
}

main().catch(err => {
  console.error('[FATAL] 予期しないエラー:', err.message, err.stack);
  // 予期しないエラーでもexit(0)でGitHub Actionsのエラーメールを止める
  process.exit(0);
});
