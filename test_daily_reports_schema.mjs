import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function check() {
  const { data } = await supabase.from('daily_reports').select('*').limit(1)
  if (data && data.length > 0) {
    console.log("Columns:", Object.keys(data[0]))
  } else {
    console.log("No daily reports found.")
  }
}
check()
