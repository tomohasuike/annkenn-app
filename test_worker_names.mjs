import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  const { data, error } = await supabase.from('worker_master').select('*').limit(1)
  console.log("Error:", error)
  if (data && data.length > 0) {
      console.log("Worker schema:", Object.keys(data[0]))
      console.log("First row:", data[0])
  }
}

test()
