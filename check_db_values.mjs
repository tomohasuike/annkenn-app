import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: w } = await supabase.from('worker_master').select('type').limit(10);
  console.log("Worker types present in DB:", [...new Set(w.map(w => w.type))]);
  
  const { data: p } = await supabase.from('projects').select('id, project_name, legacy_id').ilike('project_name', '%休暇%');
  console.log("Projects with 休暇:", p);
}
check();
