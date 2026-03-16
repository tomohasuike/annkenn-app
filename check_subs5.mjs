import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const legacyId = '13c529b6';
  const { data: a } = await supabase.from('assignments').select('id, legacy_id').eq('legacy_id', legacyId);
  console.log("Assignment with legacy ID:", a);
}
check();
