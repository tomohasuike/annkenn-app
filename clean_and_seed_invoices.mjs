import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gsczefdkcrvudddeotlx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Step 1: Show existing data count
  console.log("=== STEP 1: 現在のデータ確認 ===");
  
  const { data: existingInvoices, error: err1 } = await supabase
    .from('invoices')
    .select('id, project_id, billing_category, billing_subject, billing_destination, contract_amount, invoice_details(id, amount, details_status, billing_month, expected_deposit_date, deposit_date)')
    .order('created_at', { ascending: false });
  
  if (err1) {
    console.error("Invoices fetch error:", err1);
    return;
  }
  
  console.log(`既存の請求書: ${existingInvoices?.length || 0}件`);
  
  if (existingInvoices && existingInvoices.length > 0) {
    for (const inv of existingInvoices) {
      const details = inv.invoice_details || [];
      console.log(`  - Invoice ${inv.id.substring(0,8)}... | category: "${inv.billing_category}" | subject: "${inv.billing_subject}" | dest: "${inv.billing_destination}" | contract: ${inv.contract_amount} | details: ${details.length}件`);
      for (const d of details) {
        console.log(`    - Detail ${d.id.substring(0,8)}... | amount: ${d.amount} | status: "${d.details_status}" | month: "${d.billing_month}" | expected: ${d.expected_deposit_date} | deposit: ${d.deposit_date}`);
      }
    }
  }

  // Step 2: Get projects to use for sample data
  console.log("\n=== STEP 2: 案件データ確認 ===");
  const { data: projects, error: err2 } = await supabase
    .from('projects')
    .select('id, project_name, project_number, client_name, status_flag')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (err2) {
    console.error("Projects fetch error:", err2);
    return;
  }

  console.log(`案件データ: ${projects?.length || 0}件 (最新10件表示)`);
  for (const p of (projects || [])) {
    console.log(`  - ${p.id.substring(0,8)}... | ${p.project_number} | ${p.project_name} | client: ${p.client_name} | status: ${p.status_flag}`);
  }

  // Step 3: Check invoices table schema
  console.log("\n=== STEP 3: テーブルスキーマ確認 ===");
  const { data: invCols } = await supabase.from('invoices').select('*').limit(0);
  console.log("invoices columns available (from empty query)");
  
  const { data: detCols } = await supabase.from('invoice_details').select('*').limit(0);
  console.log("invoice_details columns available (from empty query)");
  
  console.log("\n=== 完了 ===");
  console.log("データの確認が完了しました。削除と再投入は別のステップで行います。");
}

main().catch(console.error);
