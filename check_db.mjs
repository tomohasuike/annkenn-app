import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envContent = fs.readFileSync('.env.local', 'utf8');
const url = envContent.match(/VITE_SUPABASE_URL=(.*)/)?.[1];
const key = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1];
const supabase = createClient(url, key);

async function run() {
  const { data: p } = await supabase.from('projects').select('*').limit(1);
  console.log('Project cols:', Object.keys(p[0] || {}));

  // Let's check projects with project_number '240808'
  const { data: p2 } = await supabase.from('projects').select('*').in('project_number', ['240808', '260206']);
  console.log('Specific Projects:', p2);

  const { data: i } = await supabase.from('invoices').select('*').limit(1);
  console.log('Invoice cols:', Object.keys(i[0] || {}));
}
run();
