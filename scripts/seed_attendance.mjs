import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

const supabaseUrl = 'https://gsczefdkcrvudddeotlx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function seedAttendance() {
  try {
    console.log('Fetching workers to seed...');
    
    const { data: workers, error: workerErr } = await supabase
      .from('worker_master')
      .select('id, name')
      .neq('type', '協力会社')
      .neq('type', '事務員');
      
    if (workerErr) throw workerErr;
  
  const targetWorkers = workers.filter(w => !w.name.includes('蓮池'));
  console.log(`Found ${targetWorkers.length} target workers.`);

  const records = [];
  
  // From 2026-02-26 to 2026-03-25
  const startDate = new Date('2026-02-26T00:00:00+09:00');
  const endDate = new Date('2026-03-25T00:00:00+09:00');
  
  // Fetch report_personnel to see if they worked
  const { data: reportData } = await supabase
    .from('report_personnel')
    .select(`
      worker_id,
      daily_reports!inner(report_date)
    `)
    .gte('daily_reports.report_date', '2026-02-26')
    .lte('daily_reports.report_date', '2026-03-25');
    
  const workingDays = new Set();
  if (reportData) {
    reportData.forEach(r => {
      if (r.worker_id && r.daily_reports) {
        workingDays.add(`${r.worker_id}_${r.daily_reports.report_date}`);
      }
    });
  }

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const isWeekend = d.getDay() === 0; // Only Sunday off? Usually Construction is Mon-Sat.
    const dateStr = d.toISOString().split('T')[0];
    
    for (const worker of targetWorkers) {
      const workedOnProject = workingDays.has(`${worker.id}_${dateStr}`);
      
      // If it's Sunday and no project, they probably didn't work.
      if (isWeekend && !workedOnProject) continue;
      
      // Randomly occasionally absent on weekdays if not assigned to project (90% attendance if not explicitly in a project)
      if (!isWeekend && !workedOnProject && Math.random() > 0.9) continue;
      
      const inHour = 7 + Math.floor(Math.random() * 2); // 07:00 or 08:00
      const inMin = Math.floor(Math.random() * 60);
      const outHour = 17 + Math.floor(Math.random() * 3); // 17:00, 18:00, 19:00
      const outMin = Math.floor(Math.random() * 60);

      records.push({
        worker_id: worker.id,
        target_date: dateStr,
        clock_in_time: new Date(`${dateStr}T${inHour.toString().padStart(2,'0')}:${inMin.toString().padStart(2,'0')}:00+09:00`).toISOString(),
        clock_out_time: new Date(`${dateStr}T${outHour.toString().padStart(2,'0')}:${outMin.toString().padStart(2,'0')}:00+09:00`).toISOString(),
        role: workedOnProject ? (Math.random() > 0.8 ? '職長' : '一般') : '一般', // Mostly '一般'
        prep_time_minutes: [0, 15, 30][Math.floor(Math.random() * 3)],
        travel_time_minutes: [30, 45, 60, 90][Math.floor(Math.random() * 4)],
        is_locked: false
      });
    }
  }

  console.log(`Inserting ${records.length} records into daily_attendance...`);
  
  // Clear existing records in that range first?
  const { error: delErr } = await supabase
    .from('daily_attendance')
    .delete()
    .gte('target_date', '2026-02-26')
    .lte('target_date', '2026-03-25');
  if (delErr) {
    console.error('Error deleting old data:', delErr);
  }

  // Insert chunks of 100
  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100);
    const { error: insErr } = await supabase.from('daily_attendance').insert(chunk);
    if (insErr) {
      console.error('Insert error details:', insErr.message || JSON.stringify(insErr));
      console.error('Chunk item sample:', chunk[0]);
    }
  }

    console.log('Seeding complete.');
  } catch (error) {
    console.error('Fatal Error:', error);
  }
}

seedAttendance();
