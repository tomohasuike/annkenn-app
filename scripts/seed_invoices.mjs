import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gsczefdkcrvudddeotlx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("=== STEP 1: 既存データを削除 ===");
  
  // Get all existing invoices
  const { data: existingInvoices } = await supabase.from('invoices').select('id');
  if (existingInvoices && existingInvoices.length > 0) {
    console.log(`削除対象の請求書: ${existingInvoices.length}件`);
    // Delete invoice details first (if no cascade)
    await supabase.from('invoice_details').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    // Delete invoices
    const { error: delErr } = await supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) console.error("削除エラー:", delErr);
    else console.log("削除成功");
  } else {
    console.log("既存の請求書はありませんでした。");
  }
  
  console.log("\n=== STEP 2: サンプル案件の取得 ===");
  // Get two random projects to seed with
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(2);
    
  if (!projects || projects.length < 2) {
    console.error("案件データが不足しています");
    return;
  }
  
  const proj1 = projects[0];
  const proj2 = projects[1];
  console.log(`プロジェクト1: ${proj1.project_name}`);
  console.log(`プロジェクト2: ${proj2.project_name}`);

  console.log("\n=== STEP 3: サンプルデータの投入 ===");
  
  // --- INVOICE 1: 出来高請求 (Partial) / 請求中 ---
  const { data: inv1, error: err1 } = await supabase.from('invoices').insert({
    project_id: proj1.id,
    project_number: proj1.project_number,
    billing_category: "出来高",
    orderer_category: "法人",
    billing_subject: `${proj1.project_name} - 中間請求(1回目)`,
    billing_destination: proj1.client_name || "サンプル株式会社",
    contract_amount: 1000000,
    overall_notes: "テストコメント：出来高の中間"
  }).select().single();
  
  if (err1) console.error("Inv1 Error:", err1);
  else {
    console.log(`請求1作成完了 (出来高): ${inv1.id}`);
    
    // Insert details for Inv1
    await supabase.from('invoice_details').insert([
      {
        invoice_id: inv1.id,
        amount: 300000,
        billing_month: "2026-03",
        expected_deposit_date: "2026-04-30",
        deposit_date: null,
        details_status: "請求済",
        details_notes: "遅延なしの正常な請求"
      },
      {
        invoice_id: inv1.id,
        amount: 200000,
        billing_month: "2026-02",
        expected_deposit_date: "2026-02-28", // overdue
        deposit_date: null,
        details_status: "請求済",
        details_notes: "※テスト用：過去日付で遅延フラグを発生させる用"
      }
    ]);
  }

  // --- INVOICE 2: 完成請求 (Complete) / 全て入金済 (完了履歴へ行くべきデータ) ---
  const { data: inv2, error: err2 } = await supabase.from('invoices').insert({
    project_id: proj2.id,
    project_number: proj2.project_number,
    billing_category: "完成",
    orderer_category: "法人",
    billing_subject: `${proj2.project_name} - 最終完了請求`,
    billing_destination: proj2.client_name || "テスト建設有限会社",
    contract_amount: 500000,
    overall_notes: "テストコメント：すべて完了したデータ。履歴タブに出るはず。"
  }).select().single();
  
  if (err2) console.error("Inv2 Error:", err2);
  else {
    console.log(`請求2作成完了 (完成): ${inv2.id}`);
    
    // Insert details for Inv2
    await supabase.from('invoice_details').insert([
      {
        invoice_id: inv2.id,
        amount: 500000,
        billing_month: "2026-01",
        expected_deposit_date: "2026-02-28",
        deposit_date: "2026-02-25", // paid
        details_status: "入金済",
        details_notes: "期日通りに入金済み"
      }
    ]);
  }
  
  // --- INVOICE 3: 完成請求 (Complete) だが、未入金がある (請求中タブにいるべきデータ) ---
  const { data: inv3, error: err3 } = await supabase.from('invoices').insert({
    project_id: proj1.id, // same as proj1 to show multiple invoices in 1 project
    project_number: proj1.project_number,
    billing_category: "完成",
    orderer_category: "法人",
    billing_subject: `${proj1.project_name} - 最終請求`,
    billing_destination: proj1.client_name || "サンプル株式会社",
    contract_amount: 1000000,
    overall_notes: "テストコメント：完成請求だが未入金がある"
  }).select().single();
  
  if (err3) console.error("Inv3 Error:", err3);
  else {
    console.log(`請求3作成完了 (完成・未入金): ${inv3.id}`);
    
    // Insert details for Inv3
    await supabase.from('invoice_details').insert([
      {
        invoice_id: inv3.id,
        amount: 500000,
        billing_month: "2026-04",
        expected_deposit_date: "2026-05-31",
        deposit_date: null,
        details_status: "未請求",
        details_notes: "これから請求する分"
      }
    ]);
  }
  
  console.log("\n=== 完了 ===");
  console.log("データの再投入が完了しました！");
}

main().catch(console.error);
