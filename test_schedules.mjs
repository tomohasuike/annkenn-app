import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  const { data, error } = await supabase.from('tomorrow_schedules').select('id, reporter, schedule_date').neq('reporter', '').order('created_at', { ascending: false }).limit(5)
  console.log("Error:", error)
  console.log("Recent nonempty schedules:", data)
}
test()
