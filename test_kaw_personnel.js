import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: reports } = await supabase.from('daily_reports').select('id, reporter_name, projects!inner(id, project_name, category), report_personnel(worker_name)').eq('projects.category', '川北');
  console.log('Kawakita reports count:', reports.length);
  const noPersonnel = reports.filter(r => !r.report_personnel || r.report_personnel.length === 0);
  console.log('Kawakita reports with NO personnel:', noPersonnel.length);
  if (noPersonnel.length > 0) {
      console.log('Sample missing personnel reporter name:', noPersonnel[0].reporter_name);
  }
}
run();
