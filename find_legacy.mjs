import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const legacyId = '13c529b6';
  
  // Try daily_reports
  const { data: d1 } = await supabase.from('daily_reports').select('id').eq('legacy_id', legacyId);
  console.log("daily_reports:", d1);
  
  // Try project_daily_data
  const { data: d2 } = await supabase.from('project_daily_data').select('id').eq('legacy_id', legacyId);
  console.log("project_daily_data:", d2);
  
  // Try global_memos ...  wait, it has no legacy_id 

  // Wait, let's find the `tomorrow_schedules` that has created_at closest to the subcontractor's created_at!
  const subCreatedAt = '2026-03-13T13:46:55.684498+00:00';
  const { data: closestSchedules } = await supabase.from('tomorrow_schedules')
    .select('id, legacy_id, schedule_date, projects(name), created_at')
    .order('created_at', { ascending: false })
    .limit(10);
    
  console.log("Recent schedules around that time:", closestSchedules);
}
check();
