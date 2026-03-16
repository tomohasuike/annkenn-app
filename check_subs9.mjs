import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Get an ID of a schedule that has subcontractors
  const { data: subsLinked } = await supabase.from('tomorrow_subcontractors').select('schedule_id').not('schedule_id', 'is', null).limit(1);
  if (!subsLinked || subsLinked.length === 0) return;
  
  const sid = subsLinked[0].schedule_id;
  
  // Do the exact query from TomorrowSchedules.tsx
  const { data, error } = await supabase
        .from('tomorrow_schedules')
        .select(`
          id,
          schedule_date,
          tomorrow_subcontractors(subcontractor_name, worker_count)
        `)
        .eq('id', sid)
        .single();
        
  console.log("Query Result:", JSON.stringify(data, null, 2));
  if (error) console.log("Error:", error);
}
check();
