import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
async function test() {
  const { data, error } = await supabase.from('projects').select('id, project_name').limit(1);
  console.log(Object.keys(data[0] || {}));
}
test();
