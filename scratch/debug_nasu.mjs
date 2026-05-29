import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("=== デバッグ開始: カゴメ那須工場のデータ精査 ===");

  // 1. 「那須」を含む案件をすべて取得
  const { data: projects, error: pError } = await supabase
    .from('projects')
    .select('id, project_number, project_name, status_flag, client_name')
    .or('project_name.ilike.%那須%,site_name.ilike.%那須%,client_name.ilike.%那須%');

  if (pError) {
    console.error("案件の取得に失敗しました:", pError);
    return;
  }

  console.log(`\n--- 該当する案件一覧 (${projects.length}件) ---`);
  projects.forEach(p => {
    console.log(`ID: ${p.id} | 番号: ${p.project_number} | 名前: ${p.project_name} | ステータス: ${p.status_flag} | 発注者: ${p.client_name}`);
  });

  const projectIds = projects.map(p => p.id);

  // 2. これらの案件に関連する請求（project_id が一致、または project_ids に含まれる）をすべて取得
  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select('id, project_id, project_ids, billing_subject, billing_category, contract_amount, invoice_details(*)');

  if (invError) {
    console.error("請求データの取得に失敗しました:", invError);
    return;
  }

  // フィルタリング
  const relatedInvoices = invoices.filter(inv => {
    const isPrimary = projectIds.includes(inv.project_id);
    const isCombined = inv.project_ids && inv.project_ids.some(id => projectIds.includes(id));
    return isPrimary || isCombined;
  });

  console.log(`\n--- 関連する請求データ一覧 (${relatedInvoices.length}件) ---`);
  relatedInvoices.forEach(inv => {
    console.log(`\n請求ID: ${inv.id}`);
    console.log(`  件名: ${inv.billing_subject} | 区分: ${inv.billing_category} | 金額: ${inv.contract_amount}`);
    console.log(`  メイン案件ID: ${inv.project_id}`);
    console.log(`  合算された案件ID一覧 (project_ids):`, inv.project_ids);
    console.log(`  明細データ:`);
    if (!inv.invoice_details || inv.invoice_details.length === 0) {
      console.log(`    (明細なし)`);
    } else {
      inv.invoice_details.forEach(d => {
        console.log(`    - 明細ID: ${d.id} | 対象月: ${d.billing_month} | 金額: ${d.amount} | ステータス: ${d.details_status} | 入金日: ${d.deposit_date}`);
      });
    }
  });

  console.log("\n=== デバッグ終了 ===");
}

run();
