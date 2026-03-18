import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import * as dateFns from 'date-fns'

dotenv.config({ path: '.env.local' })
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  console.log("=== CHECKING DASHBOARD FILTERS ===");
  
  // 1. Projects
  const { data: allProj } = await supabase.from('projects').select('status_flag');
  const projCounts = {};
  if(allProj) {
      allProj.forEach(p => {
          projCounts[p.status_flag] = (projCounts[p.status_flag] || 0) + 1;
      });
  }
  console.log("Project Status Counts:", projCounts);
  
  // 2. Schedule for Today
  const todayStr = dateFns.format(new Date(), 'yyyy-MM-dd');
  console.log("Today is:", todayStr);
  const { data: assignToday } = await supabase.from('assignments').select('id').eq('date', todayStr);
  console.log("Assignments for", todayStr, ":", assignToday ? assignToday.length : 0);
  
  // Schedule for tomorrow just in case
  const tomorrowStr = dateFns.format(dateFns.addDays(new Date(), 1), 'yyyy-MM-dd');
  const { data: assignTmr } = await supabase.from('assignments').select('id').eq('date', tomorrowStr);
  console.log("Assignments for", tomorrowStr, ":", assignTmr ? assignTmr.length : 0);

  // 3. Daily reports
  const { data: reports } = await supabase.from('daily_reports').select('id').limit(5);
  console.log("Total daily reports found:", reports ? reports.length : "Table might not exist/be empty");
}
test();
