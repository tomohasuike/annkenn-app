import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const decodeBase64 = (b64: string) => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
};

// ============================================================
// 自動スケジュール送信（スケジュール一致時のみ送信）
// ============================================================
async function processSafetyTest() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing env vars');
    return { success: false, reason: "Missing env vars" };
  }

  const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: settingsData, error: settingsError } = await supabaseClient
    .from('app_settings')
    .select('*')
    .limit(1)
    .single();

  if (settingsError || !settingsData) {
    console.error('Failed to get app_settings:', settingsError);
    return { success: false, reason: "No settings found" };
  }

  if (!settingsData.enable_auto_test) {
    return { success: false, reason: "Auto test is disabled via settings" };
  }

  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const nowJST = new Date(now.getTime() + jstOffset);

  const currentMonth = (nowJST.getUTCMonth() + 1).toString();
  const currentDate = nowJST.getUTCDate().toString();
  const currentHour = nowJST.getUTCHours().toString().padStart(2, '0');
  
  const timeStr = `${currentHour}:00`; 

  console.log(`Checking match for Month: ${currentMonth}, Date: ${currentDate}, Time: ${timeStr}`);

  let scheduleObj: any = {};
  try {
     const rawSchedule = settingsData.auto_test_schedule || '{}';
     console.log(`Raw auto_test_schedule: ${rawSchedule}`);
     scheduleObj = JSON.parse(rawSchedule) || {};
  } catch(e) {
     console.error("Invalid schedule JSON:", e, "Raw value:", settingsData.auto_test_schedule);
     return { success: false, reason: "Invalid JSON format in settings", raw: settingsData.auto_test_schedule };
  }

  const monthArray = scheduleObj[currentMonth] || [];
  
  const matched = monthArray.some((item: any) => {
     return item.date === currentDate && item.time === timeStr;
  });

  if (!matched) {
    return { success: false, reason: "No schedule match found for current date/time" };
  }

  console.log("Schedule matched! Firing webhook...");

  // msg part 1 = Base64エンコードされた日本語テキスト
  const msgPart1 = decodeBase64("44CQ5a6a5pyf44OG44K544OI44CR5a6J5ZCm56K66KqN44K344K544OG44Og44Gu6Ieq5YuV44OG44K544OI6YWN5L+h44Gn44GZ44CCCuS7peS4i+OBrlVSTOOBi+OCieWuieWQpueKtuazgeOCkuWgseWRiuOBl+OBpuOBj+OBoOOBleOBhOOAggoK");
  const messageText = msgPart1 + (settingsData.safety_app_url || '');

  if (!settingsData.safety_webhook_url) {
      console.warn("No webhook URL configured");
      return { success: false, reason: "No webhook URL configured" };
  }

  const res = await fetch(settingsData.safety_webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: messageText }),
  });

  if (!res.ok) {
     console.error("Webhook sending failed", await res.text());
     return { success: false, reason: "Webhook sending failed" };
  }

  const typeValue = decodeBase64("44OG44K544OI77yI6Ieq5YuV77yJ");
  const { error: insertErr } = await supabaseClient
    .from('safety_notification_history')
    .insert([{ type: typeValue }]);

  if (insertErr) {
     console.error("History insert failed", insertErr);
     return { success: false, reason: "History insert failed" };
  }

  return { success: true, message: "Webhook sent and history recorded successfully" };
}

// ============================================================
// 手動強制送信（SafetyDashboardから呼ばれる）
// CORSを回避するためブラウザの直接fetchではなくこのエッジ関数を経由する
// ============================================================
async function processForcedSend(type: 'test' | 'emergency') {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return { success: false, reason: "Missing env vars" };
  }

  const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

  // app_settings からwebhook URLを取得
  const { data: settingsData, error: settingsError } = await supabaseClient
    .from('app_settings')
    .select('*')
    .limit(1)
    .single();

  if (settingsError || !settingsData) {
    return { success: false, reason: "No settings found" };
  }

  if (!settingsData.safety_webhook_url) {
    return { success: false, reason: "Webhook URLが設定されていません。設定画面から登録してください。" };
  }

  const isEmergency = type === 'emergency';
  const appUrl = settingsData.safety_app_url || '';

  const messageText = isEmergency
    ? `<users/all> 【緊急】安否確認のお願い\n災害等が発生しました。直ちに以下のURLより安否状況を報告してください。\n\n${appUrl}`
    : `【テスト配信】安否確認システムの動作テストです。\n以下のURLから安否状況を報告してください。\n\n${appUrl}`;

  console.log(`Forced send: type=${type}, url=${settingsData.safety_webhook_url.substring(0, 50)}...`);

  // サーバーサイドからwebhookを呼び出す（CORSなし）
  const res = await fetch(settingsData.safety_webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: messageText }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Webhook sending failed:", errorText);
    return { success: false, reason: `Webhook送信失敗: ${res.status} ${errorText}` };
  }

  // 送信履歴を記録
  const historyType = isEmergency ? '本番（緊急）' : 'テスト送信';
  const { error: insertErr } = await supabaseClient
    .from('safety_notification_history')
    .insert([{ type: historyType }]);

  if (insertErr) {
    console.error("History insert failed", insertErr);
    // 送信は成功しているので警告だけ
    return { success: true, message: "送信成功（履歴記録失敗）", warning: insertErr.message };
  }

  return { success: true, message: `${isEmergency ? '緊急' : 'テスト'}通知を送信しました。` };
}

// ============================================================
// Deno.cron による自動実行（1時間ごと）
// NOTE: Deno.cronが利用できない環境はtry-catchで無視し、
//       pg_cronのHTTP呼び出しで代替する
// ============================================================
try {
  Deno.cron("safety-auto-test-cron", "0 * * * *", async () => {
    console.log("CRON triggered: safety-auto-test-cron");
    await processSafetyTest();
  });
  console.log("Deno.cron: safety-auto-test-cron を登録しました");
} catch (e) {
  console.warn("Deno.cron is not available in this environment:", e);
}

// ============================================================
// HTTP サーバー
// GET/POST ?force=true&type=test|emergency → 即時強制送信（SafetyDashboardから）
// GET/POST （パラメータなし）             → スケジュール確認して自動送信
// ============================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // URL パラメータと body 両方からオプションを取得
    const url = new URL(req.url);
    let force = url.searchParams.get('force') === 'true';
    let type: 'test' | 'emergency' = (url.searchParams.get('type') as any) || 'test';

    // POSTボディからも取得（supabase.functions.invoke 対応）
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.force === true) force = true;
        if (body.type === 'emergency') type = 'emergency';
        if (body.type === 'test') type = 'test';
      } catch {
        // bodyが無くてもOK
      }
    }

    let result;
    if (force) {
      // 手動強制送信モード（ブラウザのCORS回避のためエッジ関数経由）
      console.log(`Force send requested: type=${type}`);
      result = await processForcedSend(type);
    } else {
      // 自動スケジュール確認モード
      result = await processSafetyTest();
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Error in HTTP trigger:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
