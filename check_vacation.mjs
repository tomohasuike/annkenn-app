import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: projs } = await supabase.from('projects').select('id, name:project_name, category, legacy_id').or('legacy_id.eq.vacation,category.eq.その他,project_name.ilike.%休暇%');
  console.log("Projects matching vacation criteria:", projs);
  
  // also check where the actual assignments are going for recent dates that should be vacation
  const { data: assignments } = await supabase.from('assignments').select('project_id, worker_master(name)').gte('assignment_date', '2026-03-15').limit(50);
  
  const projCounts = {};
  assignments.forEach(a => {
      projCounts[a.project_id] = (projCounts[a.project_id] || 0) + 1;
  });
  console.log("Recent assignment count by project id:", projCounts);
}
check();
