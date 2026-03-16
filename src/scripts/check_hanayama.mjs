import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve('.env.local') })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function run() {
  const { data: workers } = await supabase.from('worker_master').select('*').like('name', '%花山%')
  console.log('workers:', workers)
  if (workers && workers.length > 0) {
     const { data: assignments } = await supabase.from('assignments').select('*, project_id').eq('worker_id', workers[0].id)
     console.log('assignments:', assignments)
  }
}
run()
