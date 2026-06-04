import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// ヘルパー関数
// ============================================================

// 気温・湿度からWBGTを近似算出（環境省近似式）
function calculateWBGT(temp: number, humidity: number): number {
  const e = (humidity / 100) * 6.105 * Math.exp((17.27 * temp) / (temp + 237.3));
  const wbgt = 0.567 * temp + 0.393 * e + 3.94;
  return Math.round(wbgt * 10) / 10;
}

// WBGTからリスクレベルを判定
function getRiskLevel(wbgt: number) {
  if (wbgt < 21) return { level: "ほぼ安全", emoji: "🟢", instruction: "熱中症の危険は小さいですが、適度な水分補給を心がけましょう。" };
  if (wbgt < 25) return { level: "注意", emoji: "🟡", instruction: "運動や重労働の際は、定期的な水分・塩分補給を行いましょう。" };
  if (wbgt < 28) return { level: "警戒", emoji: "🟠", instruction: "熱中症の危険度が高まります。1時間に1回以上の休憩と水分補給を徹底してください。" };
  if (wbgt < 31) return { level: "厳重警戒", emoji: "🔴", instruction: "外出時は直射日光を避け、激しい作業は控えるか十分な休息を取ってください。" };
  return { level: "危険", emoji: "🔥", instruction: "極めて危険な状態です。作業の中止や冷房の効いた屋内への退避、積極的な水分・塩分補給を最優先してください！" };
}

// ============================================================
// メイン処理
// mode: "prompt"  = 時刻ちょうど・全員への促し通知
// mode: "reminder" = 30分後・未申告者だけへのリマインド
// ============================================================

async function processHeatstrokeReminders(checkTimeType: string, mode: "prompt" | "reminder") {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookUrl = Deno.env.get('GOOGLE_CHAT_WEBHOOK_URL');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase environment variables');
    return { success: false, reason: "Missing Supabase env vars" };
  }
  if (!webhookUrl) {
    console.error('Missing GOOGLE_CHAT_WEBHOOK_URL');
    return { success: false, reason: "Missing GOOGLE_CHAT_WEBHOOK_URL" };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 今日の日付（JST）を取得
  const now = new Date();
  const todayJST = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = todayJST.toISOString().split("T")[0]; // yyyy-MM-dd

  console.log(`[Heatstroke v2] mode="${mode}", time="${checkTimeType}", date="${todayStr}"`);

  // ============================================================
  // STEP 1: 気象データ取得（那須塩原市基準）
  // ============================================================
  let temperature = 25.0;
  let humidity = 60.0;

  try {
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=36.962&longitude=140.016&hourly=temperature_2m,relative_humidity_2m&timezone=Asia%2FTokyo`
    );
    if (weatherRes.ok) {
      const weatherData = await weatherRes.json();
      const hourly = weatherData.hourly;
      if (hourly?.time) {
        let targetHourStr = "08:00";
        if (checkTimeType === "10時休憩") targetHourStr = "10:00";
        if (checkTimeType === "15時休憩") targetHourStr = "15:00";
        const idx = hourly.time.findIndex((t: string) => t.startsWith(`${todayStr}T${targetHourStr}`));
        if (idx !== -1) {
          temperature = hourly.temperature_2m[idx] || temperature;
          humidity = hourly.relative_humidity_2m[idx] || humidity;
        }
      }
    }
  } catch (e) {
    console.warn("Weather fetch failed, using defaults:", e);
  }

  const wbgt = calculateWBGT(temperature, humidity);
  const risk = getRiskLevel(wbgt);

  // ============================================================
  // STEP 2: 本日のアサイン取得
  // ============================================================
  const { data: assignments, error: assignError } = await supabase
    .from('assignments')
    .select(`
      id, project_id, worker_id,
      worker_master!assignments_worker_id_fkey ( id, name, type, email ),
      project:projects ( id, project_name, site_name, project_number, category )
    `)
    .eq('assignment_date', todayStr);

  if (assignError) {
    console.error('Failed to fetch assignments:', assignError);
    return { success: false, reason: "Failed to fetch assignments" };
  }

  if (!assignments?.length) {
    return { success: true, message: "No assignments for today." };
  }

  // ============================================================
  // STEP 3: 現場ごとにグループ化（除外条件を適用）
  // ============================================================
  const projectGroups: Record<string, {
    project: any;
    workers: any[];
    session: any | null;
    workerChecks: any[];
  }> = {};

  for (const item of assignments) {
    const p = item.project as any;
    const worker = item.worker_master as any;
    if (!p || !worker) continue;

    const isVacation =
      p.project_number === 'VACATION' ||
      p.category === 'その他' ||
      (typeof p.project_name === 'string' && p.project_name.includes('休暇'));
    if (isVacation) continue;

    if (['社長', '事務員', '協力会社'].includes(worker.type)) continue;

    const pId = p.id;
    if (!projectGroups[pId]) {
      projectGroups[pId] = { project: p, workers: [], session: null, workerChecks: [] };
    }
    projectGroups[pId].workers.push(worker);
  }

  const activeProjectCount = Object.keys(projectGroups).length;
  if (activeProjectCount === 0) {
    return { success: true, message: "No active field assignments today." };
  }

  // ============================================================
  // STEP 4: セッション・個人申告データ取得（reminderモードのみ）
  // promptモードはステータス不要（全員に一律送信）
  // ============================================================
  if (mode === "reminder") {
    const projectIds = Object.keys(projectGroups);
    const { data: sessions } = await supabase
      .from('heatstroke_sessions')
      .select('*')
      .in('project_id', projectIds)
      .eq('target_date', todayStr)
      .eq('check_time_type', checkTimeType);

    for (const session of (sessions || [])) {
      if (session.project_id && projectGroups[session.project_id]) {
        projectGroups[session.project_id].session = session;
      }
    }

    const sessionIds = (sessions || []).map(s => s.id);
    if (sessionIds.length > 0) {
      const { data: checks } = await supabase
        .from('heatstroke_worker_checks')
        .select('*')
        .in('session_id', sessionIds);

      for (const check of (checks || [])) {
        const session = (sessions || []).find(s => s.id === check.session_id);
        if (session?.project_id && projectGroups[session.project_id]) {
          projectGroups[session.project_id].workerChecks.push(check);
        }
      }
    }

    // reminderモード：全員完了なら通知不要
    let hasAnyPending = false;
    for (const pId in projectGroups) {
      const group = projectGroups[pId];
      const checkedIds = new Set(group.workerChecks.map((c: any) => c.worker_id));
      const unsubmitted = group.workers.filter(w => !checkedIds.has(w.id));
      const isSolo = group.workers.length <= 1;
      const isConfirmed = !!group.session?.confirmed_at;
      const allSubmitted = unsubmitted.length === 0 && !!group.session;

      if (unsubmitted.length > 0 || !group.session || (!isSolo && !isConfirmed && allSubmitted)) {
        hasAnyPending = true;
        break;
      }
    }

    if (!hasAnyPending) {
      console.log("All complete. Skipping reminder.");
      return { success: true, message: "All complete. No reminder needed." };
    }
  }

  // ============================================================
  // STEP 5: メッセージ構築
  // ============================================================
  let messageText = "";

  // ────────────────────────────────────────
  // 【promptモード】全員への促し通知
  // ────────────────────────────────────────
  if (mode === "prompt") {
    const timeLabel =
      checkTimeType === "朝" ? "朝（7:45）" :
      checkTimeType === "10時休憩" ? "10時休憩（10:00）" : "15時休憩（15:00）";

    messageText += `🌞 *【熱中症安否確認】${timeLabel} チェックの時間です！* 🌞\n`;
    messageText += `────────────────━━━━━━━━\n`;
    messageText += `📅 ${todayStr} | 🌡️ 気温 *${temperature.toFixed(1)}℃* | 💦 湿度 *${humidity.toFixed(1)}%* | 📊 WBGT *${wbgt.toFixed(1)}* → ${risk.emoji} *【${risk.level}】*\n`;
    messageText += `📢 ${risk.instruction}\n`;
    messageText += `────────────────━━━━━━━━\n\n`;
    messageText += `📋 *本日の現場メンバー全員、アプリで体調申告をお願いします！*\n\n`;

    for (const pId in projectGroups) {
      const group = projectGroups[pId];
      const pNum = group.project.project_number ? `[${group.project.project_number}] ` : "";
      const siteSuffix = group.project.site_name ? ` (${group.project.site_name})` : "";
      const displayName = `${pNum}${group.project.project_name}${siteSuffix}`;

      messageText += `*${displayName}*\n`;

      const memberLines = group.workers
        .map((w: any) => `  *${w.name}*`)
        .join('\n');
      messageText += `${memberLines}\n`;
      messageText += `  ↑ HITECポータルアプリで「体調を自己申告する」をタップ！💪\n\n`;
    }

    messageText += `────────────────━━━━━━━━\n`;
    messageText += `📱 HITECポータル「管理システム」→「熱中症安否確認」\n`;
    messageText += `体調管理・水分補給・塩分補給を徹底して、安全に作業してください！👷‍♂️✨\n`;

  // ────────────────────────────────────────
  // 【reminderモード】未申告者だけへのリマインド
  // ────────────────────────────────────────
  } else {
    const timeLabel =
      checkTimeType === "朝" ? "朝（8:15）" :
      checkTimeType === "10時休憩" ? "10時休憩（10:30）" : "15時休憩（15:30）";

    messageText += `⏰ *【熱中症安否確認】${timeLabel} リマインダー* ⏰\n`;
    messageText += `────────────────━━━━━━━━\n`;
    messageText += `📅 ${todayStr} | 📊 WBGT *${wbgt.toFixed(1)}* → ${risk.emoji} *【${risk.level}】*\n`;
    messageText += `────────────────━━━━━━━━\n`;
    messageText += `まだ申告していないメンバーがいます。速やかに登録をお願いします！\n\n`;

    let totalMissing = 0;
    let totalPendingConfirm = 0;
    let totalComplete = 0;

    for (const pId in projectGroups) {
      const group = projectGroups[pId];
      const pNum = group.project.project_number ? `[${group.project.project_number}] ` : "";
      const siteSuffix = group.project.site_name ? ` (${group.project.site_name})` : "";
      const displayName = `${pNum}${group.project.project_name}${siteSuffix}`;

      const checkedIds = new Set(group.workerChecks.map((c: any) => c.worker_id));
      const unsubmitted = group.workers.filter(w => !checkedIds.has(w.id));
      const isSolo = group.workers.length <= 1;
      const isConfirmed = !!group.session?.confirmed_at;
      const allSubmitted = unsubmitted.length === 0 && !!group.session;

      // ケース①：セッション未作成（気象情報・申告ともに未登録）
      if (!group.session) {
        totalMissing += group.workers.length;
        messageText += `*${displayName}*\n`;
        messageText += `  ❌ 気象情報の設定＆全員の申告が未登録\n`;
        const mentionLines = group.workers
          .map((w: any) => `  👆 *${w.name}*`)
          .join('\n');
        messageText += `${mentionLines} 現地に着いたらアプリで設定してください！\n`;
        messageText += `\n`;

      // ケース②：申告未提出のメンバーがいる
      } else if (unsubmitted.length > 0) {
        totalMissing += unsubmitted.length;
        messageText += `*${displayName}* （${group.workers.length - unsubmitted.length}/${group.workers.length}名 申告済み）\n`;
        for (const w of unsubmitted) {
          messageText += `  ❌ *${w.name}* さんが未申告 → アプリで申告をお願いします！💪\n`;
        }
        messageText += `\n`;

      // ケース③：全員申告済みだがまとめ役の確認待ち
      } else if (!isSolo && !isConfirmed) {
        totalPendingConfirm++;
        messageText += `*${displayName}* ✅ 全員申告済み\n`;
        messageText += `  🔔 まとめ役の最終承認（目視確認）がまだです\n`;
        const foremanId = group.session.foreman_id || group.session.created_by;
        const foremanCandidate = group.workers.find((w: any) => w.id === foremanId) || group.workers[0];
        if (foremanCandidate) {
          messageText += `  → *${foremanCandidate.name}* さん アプリで「まとめ役確認・承認」をお願いします！✅\n`;
        }
        messageText += `\n`;

      // ケース④：全員完了
      } else {
        totalComplete++;
        // 完了現場はリマインダーに含めない（スッキリさせる）
      }

      // 高・中リスク者の警告（申告済みの場合のみ）
      if (group.session && unsubmitted.length === 0) {
        const highRisk = group.workerChecks.filter((c: any) => c.risk_score === '高');
        const midRisk = group.workerChecks.filter((c: any) => c.risk_score === '中');
        if (highRisk.length > 0) {
          messageText += `  🔴 *高リスク要注意*: ${highRisk.map((c: any) => c.worker_name).join(', ')} → まとめ役は個別に声をかけてください！\n\n`;
        } else if (midRisk.length > 0) {
          messageText += `  🟡 *中リスク注意*: ${midRisk.map((c: any) => c.worker_name).join(', ')}\n\n`;
        }
      }
    }

    messageText += `────────────────━━━━━━━━\n`;
    if (totalMissing > 0) messageText += `⚠️ 未申告: *${totalMissing}名*\n`;
    if (totalPendingConfirm > 0) messageText += `🔔 まとめ役確認待ち: *${totalPendingConfirm}現場*\n`;
    if (totalComplete > 0) messageText += `✅ 完了: *${totalComplete}現場*\n`;
    messageText += `\n📱 HITECポータル「管理システム」→「熱中症安否確認」\nご安全に！👷‍♂️✨\n`;
  }

  // ============================================================
  // STEP 6: Google Chat Webhook へ POST
  // ============================================================
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: messageText }),
  });

  if (!res.ok) {
    console.error("Webhook POST failed:", await res.text());
    return { success: false, reason: "Webhook sending failed" };
  }

  // NOTE: safety_notification_history テーブルへの書き込みは廃止。
  // このテーブルは「安否確認システム（disaster/emergency用）」専用。
  // 熱中症アラートは別システムのため、ここに記録すると
  // ダッシュボードの安否確認バナーが誤表示される原因となる。

  return {
    success: true,
    message: `Heatstroke ${mode} sent for ${checkTimeType}.`,
    details: { mode, checkTimeType, wbgt, riskLevel: risk.level }
  };
}

// ============================================================
// Deno.cron による自動実行スケジュール（UTC時刻）
// ① 朝 7:45 JST (UTC 22:45) → 全員への促し
// ② 朝 8:15 JST (UTC 23:15) → 未申告者へのリマインド
// ③ 10時 10:00 JST (UTC 01:00) → 全員への促し
// ④ 10時 10:30 JST (UTC 01:30) → 未申告者へのリマインド
// ⑤ 15時 15:00 JST (UTC 06:00) → 全員への促し
// ⑥ 15時 15:30 JST (UTC 06:30) → 未申告者へのリマインド
// NOTE: Deno.cronが利用できない環境ではtry-catchで無視し、
//       Supabaseダッシュボードの「Schedules」機能でHTTP経由で呼び出す。
// ============================================================

try {
  Deno.cron("heatstroke-prompt-morning", "45 22 * * *", async () => {
    console.log("CRON: 朝 prompt 開始");
    await processHeatstrokeReminders("朝", "prompt");
  });

  Deno.cron("heatstroke-reminder-morning", "15 23 * * *", async () => {
    console.log("CRON: 朝 reminder 開始");
    await processHeatstrokeReminders("朝", "reminder");
  });

  Deno.cron("heatstroke-prompt-10", "0 1 * * *", async () => {
    console.log("CRON: 10時休憩 prompt 開始");
    await processHeatstrokeReminders("10時休憩", "prompt");
  });

  Deno.cron("heatstroke-reminder-10", "30 1 * * *", async () => {
    console.log("CRON: 10時休憩 reminder 開始");
    await processHeatstrokeReminders("10時休憩", "reminder");
  });

  Deno.cron("heatstroke-prompt-15", "0 6 * * *", async () => {
    console.log("CRON: 15時休憩 prompt 開始");
    await processHeatstrokeReminders("15時休憩", "prompt");
  });

  Deno.cron("heatstroke-reminder-15", "30 6 * * *", async () => {
    console.log("CRON: 15時休憩 reminder 開始");
    await processHeatstrokeReminders("15時休憩", "reminder");
  });

  console.log("Deno.cron: 6つのジョブを登録しました");
} catch (e) {
  // Deno.cronが利用できない環境（Supabase Freeプランなど）では無視
  // HTTP経由での手動呼び出し・Supabase Schedules機能を使用してください
  console.warn("Deno.cron is not available in this environment:", e);
}

// ============================================================
// HTTP サーバー
// クエリパラメータ:
//   type: 朝 / 10 / 15
//   mode: prompt（促す） / reminder（忘れた人用）
// ============================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // 時間帯パラメータ
    const timeParam = url.searchParams.get("type") || "朝";
    let targetTime = "朝";
    if (timeParam === "10" || timeParam === "10時" || timeParam === "10時休憩") targetTime = "10時休憩";
    else if (timeParam === "15" || timeParam === "15時" || timeParam === "15時休憩") targetTime = "15時休憩";

    // モードパラメータ（prompt=促す / reminder=忘れた人用）
    const modeParam = url.searchParams.get("mode") || "reminder";
    const mode: "prompt" | "reminder" = modeParam === "prompt" ? "prompt" : "reminder";

    const result = await processHeatstrokeReminders(targetTime, mode);
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
