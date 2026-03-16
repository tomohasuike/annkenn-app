import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
async function go() {
  const { data, error } = await supabase.from('report_materials').select('*').limit(1)
  if (error) { console.error(error); return; }
  console.log("Columns:", data.length > 0 ? Object.keys(data[0]) : "Empty table, cannot infer full schema from data");
}
go()
