import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envContent = fs.readFileSync('.env.local', 'utf8');
const url = envContent.match(/VITE_SUPABASE_URL=(.*)/)?.[1];
const key = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1];
const supabase = createClient(url, key);
async function run() {
  const { data, error } = await supabase.from('projects').select('project_number, status_flag').in('project_number', ['250307', '250709', 'KD260110', 'KD260109']);
  if (error) console.error(error);
  console.log(JSON.stringify(data, null, 2));
}
run();
