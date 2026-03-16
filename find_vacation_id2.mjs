import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: projs } = await supabase.from('projects').select('id, project_name, category, legacy_id').limit(20);
  
  const vacations = projs.filter(p => !p.project_name);
  console.log("Empty name projects:", vacations);
  
  // Actually, I can query all projects sorted by created_at ascending, and see what the early generic projects were.
  const { data: p2 } = await supabase.from('projects').select('id, project_name, category, legacy_id').order('created_at', { ascending: true }).limit(5);
  console.log("Earliest projects:", p2);
}
check();
