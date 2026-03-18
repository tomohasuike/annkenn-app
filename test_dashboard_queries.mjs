import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  console.log("--- TEST EXACT DASHBOARD QUERIES ---");

  // 1. Projects
  const { data: pData, error: pErr } = await supabase
    .from('projects')
    .select('id, project_name, site_name, number, status_flag, progress_status')
    .in('status_flag', ['着工中', '完工']);
  console.log("Projects query err:", pErr?.message, "Data len:", pData?.length);

  // 2. Schedule
  const { data: sData, error: sErr } = await supabase
    .from('assignments')
    .select(`
      id,
      project_id,
      date,
      worker_names,
      support_names,
      project:projects ( id, project_name, site_name, number )
    `)
    .eq('date', '2026-03-18');
  console.log("Schedule query err:", sErr?.message, "Data len:", sData?.length);

  // 3. Reports
  const { data: rData, error: rErr } = await supabase
    .from('daily_reports')
    .select(`
      id,
      project_id,
      report_date,
      created_at,
      report_text,
      worker_name,
      project:projects ( project_name, site_name )
    `)
    .order('created_at', { ascending: false })
    .limit(5);
  console.log("Reports query err:", rErr?.message, "Data len:", rData?.length);
  
}
test();
