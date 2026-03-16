import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: subsLinked } = await supabase.from('tomorrow_subcontractors').select('id').not('schedule_id', 'is', null);
  const { data: subsOrphaned } = await supabase.from('tomorrow_subcontractors').select('id').is('schedule_id', null);
  
  console.log(`Linked subcontractors: ${subsLinked?.length}`);
  console.log(`Orphaned subcontractors: ${subsOrphaned?.length}`);
}
check();
