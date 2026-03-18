import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('assignments')
    .select('id, assigned_by')
    .limit(1);
    
  if (error) {
    console.error("Fetch failed! Error:", error.message);
  } else {
    console.log("Fetch succeeded! Data:", data);
  }
}
check();
