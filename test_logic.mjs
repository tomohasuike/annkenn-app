import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gsczefdkcrvudddeotlx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs';
const supabase = createClient(supabaseUrl, supabaseKey);

const getDisplayClientName = (proj) => {
  if (!proj) return "";
  if (proj.client_name) return proj.client_name;
  if (proj.category === '川北') return '川北';
  if (proj.category === 'bpe') return 'BPE';
  if (proj.category?.toUpperCase() === 'BPE') return 'BPE';
  return "";
}

async function check() {
  const { data, error } = await supabase.from('projects').select('*').like('project_number', 'KD%');
  for (const p of data) {
     const name = getDisplayClientName(p);
     if (name === "" || name === " ") {
        console.log("BLANK NAME FOR", p.project_number, "client_name =", JSON.stringify(p.client_name), "category =", p.category);
     }
  }
  console.log("Done checking KD projects.");
  
  const { data: data2 } = await supabase.from('projects').select('*').eq('status_flag', '完工');
  let blankCount = 0;
  for (const p of data2) {
     const name = getDisplayClientName(p);
      if (name === "" || name === " ") {
          blankCount++;
      }
  }
  console.log("Completed projects with blank names:", blankCount);
}
check();
