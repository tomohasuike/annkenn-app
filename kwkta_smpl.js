import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: reports } = await supabase.from('daily_reports').select('id, start_time, end_time, work_category, report_personnel(worker_name), projects!inner(id, project_name, category)').eq('projects.category', '川北').limit(2);
  console.log('Kawakita raw sample:', JSON.stringify(reports, null, 2));
}
run();
