import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function check() {
  const { data: mats } = await supabase.from('report_materials').select('*').limit(5)
  console.log("Sample materials:", mats)
  const { data: rep } = await supabase.from('daily_reports').select('id, legacy_id').limit(5)
  console.log("Sample reports:", rep)
}
check()
