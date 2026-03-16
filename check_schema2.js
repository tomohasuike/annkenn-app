import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
async function run() {
  const { data, error } = await supabase.from('planned_counts').select('*').limit(1)
  console.log('planned_counts:', data ? 'exists' : 'missing', error ? error.message : '')
}
run()
