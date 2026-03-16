import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: reports } = await supabase.from('daily_reports').select('*, projects(project_name, category), report_personnel(worker_name)');
  let kawakitaHours = 0;
  let missingProjHours = 0;
  let totalH = 0;
  for (const r of reports) {
      if (!r.start_time || !r.end_time) continue;
      
      const st = r.start_time.includes('T') ? r.start_time.split('T')[1].slice(0, 5) : r.start_time.slice(0,5);
      const et = r.end_time.includes('T') ? r.end_time.split('T')[1].slice(0, 5) : r.end_time.slice(0,5);
      
      let startMin = parseInt(st.split(':')[0]) * 60 + parseInt(st.split(':')[1]);
      let endMin = parseInt(et.split(':')[0]) * 60 + parseInt(et.split(':')[1]);
      
      if (isNaN(startMin) || isNaN(endMin) || endMin <= startMin) continue;
      
      let normal = Math.min(17*60, endMin) - startMin;
      if (startMin <= 12*60 && endMin >= 13*60) normal -= 60;
      else if (startMin > 12*60 && startMin < 13*60) normal -= (13*60 - startMin);
      else if (endMin > 12*60 && endMin < 13*60) normal -= (endMin - 12*60);
      
      let ot = Math.max(0, endMin - Math.max(startMin, 17*60));
      let h = (Math.max(0, normal) + Math.max(0, ot)) / 60;
      
      let workersCount = Array.isArray(r.report_personnel) ? r.report_personnel.length : 0;
      let rHours = h * workersCount;
      totalH += rHours;
      
      const pInfo = Array.isArray(r.projects) ? r.projects[0] : r.projects;
      if (!pInfo) {
          missingProjHours += rHours;
      } else if (pInfo.category === '川北') {
          kawakitaHours += rHours;
      }
  }
  console.log('Total hours:', totalH);
  console.log('Kawakita hours:', kawakitaHours);
  console.log('Missing project hours:', missingProjHours);
}
run();
