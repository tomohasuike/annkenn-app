import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  const { data: cols } = await supabase.rpc('get_table_columns_by_name', { table_name: 'projects' })
  console.log("projects columns:", cols ? "Available via rpc (if created)" : "RPC failed");
  
  const { data: p } = await supabase.from('projects').select('id, project_name, status_flag, site_name').limit(1);
  console.log("projects test row:", p);
  
  const { data: s } = await supabase.from('assignments').select('id').limit(1);
  console.log("assignments test:", s);
}
test();
