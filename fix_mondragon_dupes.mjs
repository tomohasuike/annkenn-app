import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: worker } = await supabase.from('worker_master').select('id, name').eq('name', 'モンドラゴン　ホセ').single();
  
  const { data: rp } = await supabase.from('report_personnel').select('report_id').eq('worker_id', worker.id);
  const reportIds = rp.map(r => r.report_id);
  
  if (reportIds.length === 0) return console.log('No reports');
  
  const { data: dr } = await supabase.from('daily_reports')
     .select('id, start_time, end_time, created_at, reporter_name')
     .in('id', reportIds);
     
  const fakeIds = dr.filter(r => !r.reporter_name && r.start_time === '2000-01-01T08:00:00').map(r => r.id);
  
  console.log('Total reports for Mondragon:', dr.length);
  console.log('Fake reports to delete:', fakeIds.length);
  
  // Also check if ANY OTHER worker has these fake reports just in case
  const { data: allFakes } = await supabase.from('daily_reports')
     .select('id, created_at')
     .eq('start_time', '2000-01-01T08:00:00')
     .is('reporter_name', null)
     .gte('created_at', '2026-03-27T00:00:00Z');
  console.log('Total fake reports created recently for anyone:', allFakes ? allFakes.length : 0);
  
  if (allFakes && allFakes.length > 0) {
      console.log('Deleting all fakes...', allFakes.length);
      const idsToDelete = allFakes.map(f => f.id);
      
      // Delete personnel
      await supabase.from('report_personnel').delete().in('report_id', idsToDelete);
      // Delete daily_reports
      await supabase.from('daily_reports').delete().in('id', idsToDelete);
      console.log('Deleted successfully.');
  }
}
run();
