import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: projs, error: pErr } = await supabase.from('projects').select('id, project_name, legacy_id').or('legacy_id.eq.vacation,project_name.ilike.%休暇%');
  console.log("Vacation projects found:", projs, "Error:", pErr);
  
  if (projs && projs.length > 0) {
      const pid = projs[0].id;
      const { data: assigns, count } = await supabase.from('assignments').select('*', { count: 'exact' }).eq('project_id', pid);
      console.log(`Assignments for project ${pid}: ${count}`);
  }
}
check();
