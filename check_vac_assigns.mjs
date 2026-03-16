import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: projs } = await supabase.from('projects').select('id').eq('legacy_id', 'vacation').single();
  const vacId = projs?.id;
  
  if (!vacId) return console.log("Vacation project still not found.");
  
  const { data: assignments } = await supabase.from('assignments').select('id, worker_master(name), assignment_date').eq('project_id', vacId).gte('assignment_date', '2026-03-15');
  console.log("Vacation assignments for recent dates:", assignments);
}
check();
