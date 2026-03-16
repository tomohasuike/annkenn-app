import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve('.env.local') })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function run() {
  const { data: workers, error } = await supabase.from('worker_master').select('*')
  if (error) {
    console.error(error)
    return
  }
  const filtered = workers.filter(w => w.name.includes('池沢') || w.name.includes('横山'))
  console.log('Filtered workers:', filtered)
}
run()
