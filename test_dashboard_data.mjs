import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import * as dateFns from 'date-fns'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  console.log("--- Dashboard Data Test ---");
  
  // 1. Check Projects (着工中, 完了)
  const { data: projects, error: pErr } = await supabase
    .from('projects')
    .select('id, name, status_flag, progress_status')
    .in('status_flag', ['着工中', '完了']);
  console.log("Active Projects count:", projects?.length, pErr ? "Error: " + pErr.message : "");

  // 2. Check Today's Schedule
  const todayStr = dateFns.format(new Date(), 'yyyy-MM-dd');
  console.log("Today is:", todayStr);
  const { data: schedules, error: sErr } = await supabase
    .from('personnel_assignments')
    .select('id, project_id, date')
    .eq('date', todayStr);
  console.log("Today's schedules count:", schedules?.length, sErr ? "Error: " + sErr.message : "");
  
  // 3. Check Recent Reports
  const { data: reports, error: rErr } = await supabase
    .from('daily_reports')
    .select('id, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log("Recent reports count:", reports?.length, rErr ? "Error: " + rErr.message : "");

}
test();
