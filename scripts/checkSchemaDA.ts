import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' })
const supa = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '')

async function run() {
  const { data, error } = await supa.rpc('get_schema_info') // if they have it
  // Actually, anon/service_role cannot query information_schema easily on supabase unless we use postgres or a raw function.
  // Wait, I can just write a quick SQL to query the table using the `supabase` cli if it's running locally, but it's not.
  // Wait, I can get columns by selecting a record that DOES exist if I don't use limit(1) on an empty target_date:
  const { data: dAll, error: eAll } = await supa.from('daily_attendance').select('*').limit(1)
  console.log(dAll, eAll)
}
run()
