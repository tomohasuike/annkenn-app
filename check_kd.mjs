import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://gsczefdkcrvudddeotlx.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs');
async function run() {
  const { data: allData, error } = await supabase.from('daily_reports').select('id, site_photos, projects!inner(project_number)');
  if (error) { console.error(error); return; }
  
  const kd260309 = allData.find(r => r.projects?.project_number === 'KD260309');
  console.log('KD260309:', kd260309 ? kd260309.site_photos : 'Not found');
  
  const kd260308 = allData.find(r => r.projects?.project_number === 'KD260308');
  console.log('KD260308:', kd260308 ? kd260308.site_photos : 'Not found');
}
run();
