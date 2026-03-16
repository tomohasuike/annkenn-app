import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEnum() {
  const { data: enumData, error } = await supabase.rpc('get_enum_values', { enum_name: 'worker_type' });
  // alternative query:
  const res = await supabase.from('worker_master').select('type').limit(1);
  console.log("Types:", res.data);
}
checkEnum();
