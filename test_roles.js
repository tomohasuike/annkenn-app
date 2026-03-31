import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase
    .from('project_role_assignments')
    .select(`
      id, project_id, worker_id, role, start_date, end_date,
      project:projects(project_name, project_number),
      worker:worker_master(name)
    `)
    .order('start_date', { ascending: false });

  console.log('Error:', error);
  console.log('Data count:', data?.length);
}

test();
