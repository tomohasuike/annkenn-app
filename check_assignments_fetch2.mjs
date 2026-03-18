import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { format, addDays } from 'date-fns';

dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const start = new Date();
  const startDateStr = format(start, 'yyyy-MM-dd');
  const endDateStr = format(addDays(start, 6), 'yyyy-MM-dd');
  console.log("Fetching from", startDateStr, "to", endDateStr);

  const { data, error } = await supabase
    .from('assignments')
    .select(`
      id, assignment_date, project_id, worker_id, vehicle_id, count, notes, assigned_by,
      projects(project_name), worker_master!assignments_worker_id_fkey(name, type), vehicle_master(vehicle_name)
    `)
    .gte('assignment_date', startDateStr)
    .lte('assignment_date', endDateStr)

  if (error) {
    console.error("Fetch failed! Error:", error);
  } else {
    console.log("Fetch succeeded! Count:", data.length);
    if (data.length > 0) {
      console.log("Sample:", data[0]);
    }
  }
}
check();
