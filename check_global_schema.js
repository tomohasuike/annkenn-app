import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
async function run() {
  const { data: d1, error: e1 } = await supabase.from('global_memos').select('*').limit(1)
  console.log('global_memos:', d1 ? 'exists' : 'missing', e1 ? e1.message : '')

  const { data: d2, error: e2 } = await supabase.from('todos').select('*').limit(1)
  console.log('todos:', d2 ? 'exists' : 'missing', e2 ? e2.message : '')
}
run()
