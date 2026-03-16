import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: assignments, error } = await supabase
    .from('assignments')
    .select(`
      id, 
      project_id, 
      assignment_date, 
      worker_id, 
      worker_master(name)
    `);

  if (error) {
    console.error("Error fetching assignments:", error);
    return;
  }

  const map = {};
  let duplicatesFound = false;
  
  for (const a of assignments) {
    if (!a.worker_id) continue;
    const key = `${a.project_id}-${a.assignment_date}-${a.worker_id}`;
    if (map[key]) {
      console.log('Duplicate Assignment in DB:', a.assignment_date, a.worker_master?.name, 'Proj:', a.project_id);
      duplicatesFound = true;
    } else {
      map[key] = true;
    }
  }

  if (!duplicatesFound) {
      console.log('No duplicate assignments found in DB for the same project/date/worker.');
  }
}

main();
