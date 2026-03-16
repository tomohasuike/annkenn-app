import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const [w, v] = await Promise.all([
    supabase.from('worker_master').select('*').limit(1),
    supabase.from('vehicle_master').select('*').limit(1)
  ])
  console.log("worker_master cols:", w.data ? Object.keys(w.data[0]) : w.error)
  console.log("vehicle_master cols:", v.data ? Object.keys(v.data[0]) : v.error)
}
test()
