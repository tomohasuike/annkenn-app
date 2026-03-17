import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envContent = fs.readFileSync('.env.local', 'utf8');
const url = envContent.match(/VITE_SUPABASE_URL=(.*)/)?.[1];
const key = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1];
const supabase = createClient(url, key);

async function run() {
  const { data: p } = await supabase.from('projects').select('id, project_number, project_name').eq('project_number', '240808');
  console.log('Project:', p);
  
  if (p && p.length > 0) {
    const { data: inv } = await supabase.from('invoices').select('*, invoice_details(*)').eq('project_id', p[0].id);
    console.log('Invoices for 240808:', JSON.stringify(inv, null, 2));
  }
}
run();
