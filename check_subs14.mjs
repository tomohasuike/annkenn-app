import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: partners } = await supabase.from('partner_master').select('*').limit(5);
  console.log("Partner master:", partners);
  const { data: subs } = await supabase.from('subcontractor_master').select('*').limit(5);
  console.log("Subcontractor master:", subs);
}
check();
