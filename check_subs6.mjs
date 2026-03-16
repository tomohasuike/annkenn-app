import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: sch } = await supabase.from('tomorrow_schedules').select('*').limit(5);
  console.log("Sample schedules fields:", Object.keys(sch[0] || {}));
  
  // Is there a subcontractor_name column?
  // Let's print out the workers strings to see if they contain subcontractor names.
  const { data: subs } = await supabase.from('tomorrow_schedules').select('id, workers, work_content, notes').not('workers', 'is', null).limit(10);
  console.log("Sample workers strings:", subs.map(s => s.workers).filter(w => w !== ''));
}
check();
