import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const envPath = '.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const url = envContent.match(/VITE_SUPABASE_URL=(.*)/)?.[1];
const key = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1];
const supabase = createClient(url, key);

async function migrateBillingData() {
  console.log("Starting Billing Data Migration...");

  // Load Projects for ID mapping
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, legacy_id');

  if (projectsError) {
    console.error("Failed to fetch projects:", projectsError);
    return;
  }
  
  const legacyIdToUuidId = {};
  projects.forEach(p => {
    if (p.legacy_id) legacyIdToUuidId[p.legacy_id] = p.id;
  });

  console.log("Deleting existing test data...");
  const { error: delDetError } = await supabase.from('invoice_details').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delDetError) console.error("Error deleting old details:", delDetError);
  
  const { error: delInvError } = await supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delInvError) console.error("Error deleting old invoices:", delInvError);

  // ========== INVOICES ==========
  const invoicesCsv = fs.readFileSync('/Users/hasuiketomoo/Downloads/請求管理アプリ - 請求書.csv', 'utf8');
  const invoicesRecords = parse(invoicesCsv, {
    columns: true,
    skip_empty_lines: true
  });

  console.log(`Found ${invoicesRecords.length} invoices in CSV.`);
  let invoicesInserted = 0;

  for (const row of invoicesRecords) {
    const legacyProjectIds = (row['対象工事リスト'] || '').split(',').map(s => s.trim()).filter(Boolean);
    let masterProjectId = null;
    const mappedProjectIds = [];

    for (const lId of legacyProjectIds) {
      if (legacyIdToUuidId[lId]) {
        mappedProjectIds.push(legacyIdToUuidId[lId]);
        if (!masterProjectId) {
           masterProjectId = legacyIdToUuidId[lId];
        }
      }
    }
    
    // Ensure idempotency isn't needed since we just deleted everything, but let's leave it just in case
    const { data: existingInv } = await supabase.from('invoices').select('id').eq('legacy_id', row['ID']).single();
    if (existingInv) {
      invoicesInserted++;
      continue;
    }

    const { error: invError } = await supabase
      .from('invoices')
      .insert({
        id: crypto.randomUUID(),
        legacy_id: row['ID'],
        billing_category: row['請求区分'] || '出来高',
        orderer_category: row['発注元区分'] || '一般',
        billing_subject: row['請求件名'] || null,
        billing_destination: row['請求先名称'] || null,
        contract_amount: parseInt(row['請負金額']) || 0,
        overall_notes: row['全体備考'] || null,
        project_id: masterProjectId,
        project_ids: mappedProjectIds.length > 0 ? mappedProjectIds : '{}'
      });

    if (invError) {
      console.error(`Failed to insert invoice ${row['ID']}:`, invError.message);
    } else {
      invoicesInserted++;
    }
  }

  console.log(`Successfully migrated ${invoicesInserted} invoices.`);

  const legacyInvoiceMap = {};
  for (const row of invoicesRecords) {
    // we need to query db to get inserted uuid or rely on the fact we passed crypto.randomUUID() manually?
    // Actually we didn't store the uuid mapping. Let's fetch it from DB.
  }
  
  const { data: dbInvoices, error: invFetchErr } = await supabase.from('invoices').select('id, legacy_id');
  if (dbInvoices) {
    dbInvoices.forEach(inv => {
      legacyInvoiceMap[inv.legacy_id] = inv.id;
    });
  }

  // ========== DETAILS ==========
  const detailsCsv = fs.readFileSync('/Users/hasuiketomoo/Downloads/請求管理アプリ - 請求明細.csv', 'utf8');
  const detailsRecords = parse(detailsCsv, {
    columns: true,
    skip_empty_lines: true
  });

  console.log(`Found ${detailsRecords.length} details in CSV.`);
  let detailsInserted = 0;

  for (const row of detailsRecords) {
    const parentId = legacyInvoiceMap[row['請求書ID']] || row['請求書ID'];
    
    // Idempotent check
    const { data: existingDet } = await supabase.from('invoice_details').select('id').eq('legacy_id', row['ID']).single();
    if (existingDet) {
      detailsInserted++;
      continue;
    }

    const { error: detError } = await supabase
      .from('invoice_details')
      .insert({
        id: crypto.randomUUID(),
        legacy_id: row['ID'],
        invoice_legacy_id: row['請求書ID'],
        invoice_id: parentId,
        billing_month: row['請求対象月'] || null, 
        amount: parseInt(row['金額']) || 0,
        billing_date: row['請求日'] || null,
        expected_deposit_date: row['入金予定日'] || null,
        deposit_date: row['入金日'] || null,
        details_status: row['明細ステータス'] || '未請求',
        details_notes: row['明細備考'] || null
      });

    if (detError) {
      console.error(`Failed to insert detail ${row['ID']}:`, detError.message);
    } else {
      detailsInserted++;
    }
  }

  console.log(`Successfully migrated ${detailsInserted} details.`);
  console.log("Migration Complete.");
}

migrateBillingData();
