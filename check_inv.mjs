import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envContent = fs.readFileSync('.env.local', 'utf8');
const url = envContent.match(/VITE_SUPABASE_URL=(.*)/)?.[1];
const key = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1];
const supabase = createClient(url, key);

async function run() {
  const { data: inv } = await supabase.from('invoices').select('*, projects(*), invoice_details(*)').eq('project_number', '96');
  console.log('Invoice 96:', JSON.stringify(inv, null, 2));
}
run();
