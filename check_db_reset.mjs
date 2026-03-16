import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: projs, error: pErr } = await supabase.from('projects').select('id, project_name, created_at').order('created_at', { ascending: false }).limit(5);
  console.log("Most recently created projects:", projs);
  
  const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true });
  console.log("Total projects count:", count);
}
check();
