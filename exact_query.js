import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

function calculateActualHours(startVal, endVal) {
  const parseTime = (val) => {
    if (!val) return null;
    let d = new Date();
    if (val.includes('T')) {
      d = new Date(val);
    } else {
      const match = val.match(/(\d{1,2})[:：](\d{1,2})/);
      if (match) {
        d.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
      } else {
        d = new Date(val);
      }
    }
    if (isNaN(d.getTime())) return null;
    return d;
  };

  const st = startVal ? parseTime(startVal) : null;
  const et = endVal ? parseTime(endVal) : null;
  
  if (!st || !et) return { normal: 0, ot: 0 };
  
  const startMin = st.getHours() * 60 + st.getMinutes();
  const endMin = et.getHours() * 60 + et.getMinutes();
  if (endMin <= startMin) return { normal: 0, ot: 0 };

  const standardLimit = 17 * 60;
  const breakStart = 12 * 60;
  const breakEnd = 13 * 60;

  let normal = Math.min(standardLimit, endMin) - startMin;
  
  if (startMin <= breakStart && endMin >= breakEnd) normal -= 60;
  else if (startMin > breakStart && startMin < breakEnd) normal -= (breakEnd - startMin);
  else if (endMin > breakStart && endMin < breakEnd) normal -= (endMin - breakStart);

  let ot = Math.max(0, endMin - Math.max(startMin, standardLimit));
  
  return { 
    normal: Math.max(0, normal / 60), 
    ot: Math.max(0, ot / 60) 
  };
}

async function run() {
  const { data: reports, error } = await supabase.from('daily_reports').select(`
    id, project_id, report_date, work_category, start_time, end_time,
    projects (id, project_name, project_number, category),
    report_personnel (worker_name, worker_master(name)),
    report_vehicles (vehicle_name),
    report_machinery (machinery_name),
    report_materials (material_name, photo, documentation),
    report_subcontractors (subcontractor_name, worker_count)
  `);
  
  if (error) { console.error(error); return; }
  
  let totalH = { kouji: 0, kanri: 0, mitsumori: 0 };
  let rowCount = 0;
  
  for (const row of reports) {
      rowCount++;
      const pInfo = row.projects;
      const wKubun = row.work_category || '';
      let cat = 'mitsumori';
      if (wKubun.includes('工事')) cat = 'kouji';
      else if (wKubun.includes('管理')) cat = 'kanri';
      
      const timeInfo = calculateActualHours(row.start_time, row.end_time);
      const hours = timeInfo.normal + timeInfo.ot;
      
      const workers = Array.isArray(row.report_personnel) ? row.report_personnel : [];
      const staffsRaw = workers.map(w => {
        if (w.worker_master && !Array.isArray(w.worker_master) && w.worker_master.name) return w.worker_master.name;
        if (w.worker_master && Array.isArray(w.worker_master) && w.worker_master[0]?.name) return w.worker_master[0].name;
        return w.worker_name;
      }).filter(Boolean);
      
      staffsRaw.forEach(() => {
          totalH[cat] += hours;
      });
  }
  console.log('Total rows:', rowCount, 'Totals:', totalH);
}
run();
