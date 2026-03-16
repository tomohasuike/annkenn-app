import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: sch } = await supabase.from('tomorrow_schedules')
     .select('id, legacy_id, schedule_date, projects(project_name)')
     .gte('schedule_date', '2026-03-15')
     .order('schedule_date', { ascending: true });
     
  console.log("Upcoming schedules:", sch);
}
check();
