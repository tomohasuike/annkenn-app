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
     scheduleObj = JSON.parse(settingsData.auto_test_schedule) || {};
  } catch(e) {
     console.error("Invalid schedule JSON:", e);
     return { success: false, reason: "Invalid JSON format in settings" };
  }

  const monthArray = scheduleObj[currentMonth] || [];
  
  const matched = monthArray.some((item: any) => {
     return item.date === currentDate && item.time === timeStr;
  });

  if (!matched) {
    return { success: false, reason: "No schedule match found for current date/time" };
  }

  console.log("Schedule matched! Firing webhook...");

  // msg part 1 = Base64 encoded Japanese text
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

Deno.cron("safety-auto-test-cron", "0 * * * *", async () => {
    console.log("CRON triggered: safety-auto-test-cron");
    await processSafetyTest();
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const result = await processSafetyTest();
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
