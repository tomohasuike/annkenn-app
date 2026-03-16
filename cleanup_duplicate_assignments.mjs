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
    .select('*')
    .order('created_at', { ascending: true }); // keep the oldest ones

  if (error) {
    console.error("Error fetching assignments:", error);
    return;
  }

  const map = {};
  const idsToDelete = [];
  
  for (const a of assignments) {
    // Only looking at workers for now, but vehicles should be checked too
    if (a.worker_id) {
        const key = `${a.project_id}-${a.assignment_date}-${a.worker_id}`;
        if (map[key]) {
          idsToDelete.push(a.id);
        } else {
          map[key] = true;
        }
    } else if (a.vehicle_id) {
        const key = `${a.project_id}-${a.assignment_date}-${a.vehicle_id}`;
        if (map[key]) {
          idsToDelete.push(a.id);
        } else {
          map[key] = true;
        }
    }
  }

  console.log(`Found ${idsToDelete.length} duplicate assignments to delete.`);

  if (idsToDelete.length > 0) {
      // Chunk deletions to avoid URL length limits if there are many
      const chunkSize = 100;
      for (let i = 0; i < idsToDelete.length; i += chunkSize) {
          const chunk = idsToDelete.slice(i, i + chunkSize);
          const { error: delErr } = await supabase.from('assignments').delete().in('id', chunk);
          if (delErr) {
              console.error('Error deleting chunk:', delErr);
          } else {
              console.log(`Deleted chunk of ${chunk.length} assignments.`);
          }
      }
      console.log('Cleanup complete.');
  }
}

main();
