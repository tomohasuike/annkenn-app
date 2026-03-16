import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: assignments } = await supabase.from('assignments').select('project_id, worker_master(name)').eq('worker_master.name', '蓮池　智雄').gte('assignment_date', '2026-03-15');
  
  const pids = new Set(assignments?.map(a => a.project_id) || []);
  
  if (pids.size > 0) {
      const { data: projs } = await supabase.from('projects').select('id, project_name, legacy_id').in('id', Array.from(pids));
      console.log("Projects where Hasuike is assigned:", projs);
  }
}
check();
