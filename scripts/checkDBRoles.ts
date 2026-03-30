import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' })
const supa = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '')

async function run() {
  const { data, error } = await supa
    .from('report_personnel')
    .select('role')
    .limit(1)
  console.log('report_personnel role column check:', { data, error })
  
  const { data: da, error: daErr } = await supa
      .from('daily_attendance')
      .select('role, site_declarations')
      .limit(1)
  console.log('daily_attendance columns check:', { da, error: daErr })
}
run()
