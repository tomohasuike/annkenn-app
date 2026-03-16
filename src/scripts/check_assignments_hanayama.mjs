import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve('.env.local') })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
async function run() {
  const { data: workers } = await supabase.from('worker_master').select('*').like('name', '%花山%')
  console.log('workers:', workers)
}
run()
