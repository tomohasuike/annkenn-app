import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

// サービスロールキーを使用してRLSをバイパス
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('🚀 GASスプレッドシートデータをSupabaseに移行開始...\n');

  // 1. Excelデータ読み込み
  console.log('📄 Excelファイルを読み込み中...');
  let data;
  try {
    const result = execSync('python3 parse_excel.py tmp_safety_data.xlsx', {
      cwd: '/Users/hasuiketomoo/Developer/annkenn-app',
      maxBuffer: 1024 * 1024 * 10
    });
    data = JSON.parse(result.toString().trim());
  } catch(e) {
    console.error('Excelパースエラー:', e.message);
    process.exit(1);
  }

  console.log(`  通知履歴: ${data.notifications.length}件`);
  console.log(`  回答データ: ${data.reports.length}件\n`);

  // 2. worker_masterのメール→ID対応表を取得
  console.log('👥 社員データを取得中...');
  const { data: workers, error: workerErr } = await supabase
    .from('worker_master')
    .select('id, name, email');

  if (workerErr) { console.error('worker_masterエラー:', workerErr); process.exit(1); }

  const emailToId = {};
  workers.forEach(w => { if (w.email) emailToId[w.email.toLowerCase()] = w.id; });
  console.log(`  ${workers.length}名取得\n`);

  // 3. 通知履歴の移行
  console.log('📌 通知履歴を移行中...');
  const { data: existingNotifs } = await supabase
    .from('safety_notification_history')
    .select('sent_at');

  const existingSentAts = new Set((existingNotifs || []).map(n =>
    new Date(n.sent_at).toISOString().substring(0, 19)
  ));

  let notifAdded = 0, notifSkipped = 0;
  for (const notif of data.notifications) {
    const sentAtKey = notif.sent_at.substring(0, 19);
    if (existingSentAts.has(sentAtKey)) {
      console.log(`  ⏩ スキップ（重複）: ${notif.sent_at}`);
      notifSkipped++;
      continue;
    }
    const { error } = await supabase
      .from('safety_notification_history')
      .insert({ type: notif.type || 'テスト', sent_at: notif.sent_at });
    if (error) {
      console.error(`  ❌ エラー: ${notif.sent_at}`, error.message);
    } else {
      console.log(`  ✅ 追加: ${notif.sent_at} [${notif.type}]`);
      notifAdded++;
    }
  }
  console.log(`  → 追加: ${notifAdded}件, スキップ: ${notifSkipped}件\n`);

  // 4. 回答データの移行
  console.log('📝 回答データを移行中...');
  const { data: existingReports } = await supabase
    .from('safety_reports')
    .select('worker_id, created_at');

  const existingKeys = new Set((existingReports || []).map(r =>
    `${r.worker_id}_${new Date(r.created_at).toISOString().substring(0, 19)}`
  ));

  let reportAdded = 0, reportSkipped = 0, reportNoWorker = 0;
  for (const report of data.reports) {
    const email = report.email.toLowerCase();
    const workerId = emailToId[email];

    if (!workerId) {
      console.log(`  ⚠️  社員不明: ${report.email} (${report.name})`);
      reportNoWorker++;
      continue;
    }

    const key = `${workerId}_${report.created_at.substring(0, 19)}`;
    if (existingKeys.has(key)) {
      reportSkipped++;
      continue;
    }

    const { error } = await supabase
      .from('safety_reports')
      .insert({
        worker_id: workerId,
        status: report.status,
        family_status: report.family_status,
        house_status: report.house_status,
        location: report.location,
        memo: report.memo,
        created_at: report.created_at
      });

    if (error) {
      console.error(`  ❌ エラー: ${report.name} ${report.created_at}`, error.message);
    } else {
      reportAdded++;
      process.stdout.write(`  ${reportAdded}件追加...\r`);
    }
  }

  console.log(`\n  → 追加: ${reportAdded}件, スキップ(重複): ${reportSkipped}件, 社員不明: ${reportNoWorker}件\n`);

  // 5. 最終確認
  const { count: finalReportCount } = await supabase
    .from('safety_reports')
    .select('*', { count: 'exact', head: true });
  const { count: finalNotifCount } = await supabase
    .from('safety_notification_history')
    .select('*', { count: 'exact', head: true });

  console.log('────────────────────────────────');
  console.log('✅ 移行完了！');
  console.log(`  safety_notification_history: ${finalNotifCount}件`);
  console.log(`  safety_reports 合計: ${finalReportCount}件`);
}

migrate().catch(console.error);
