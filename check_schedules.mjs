import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('tomorrow_schedules')
    .select('*')
    .order('created_at', { ascending: false });
  console.log("Schedules total:", data?.length);
  // find a schedule with subcontractors?
  
  const { data: subs } = await supabase.from('tomorrow_subcontractors').select('*');
  console.log("Subcontractors count:", subs?.length);
  if (subs && subs.length > 0) {
      console.log("Sample sub:", subs[0]);
  }
}
check();
