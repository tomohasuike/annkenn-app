import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: history } = await supabase.from('safety_notification_history').select('*').order('sent_at', {ascending: false});
  console.log("History:");
  console.table(history);
  
  const { data: reports } = await supabase.from('safety_reports').select('worker_id, worker_master(name), created_at').order('created_at', {ascending: false});
  console.log("Recent Reports:", reports.length);
  console.table(reports.map(r => ({ worker: r.worker_master?.name, time: r.created_at })));
}
check();
