import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' })
const supa = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '')

async function run() {
  const { data: daData } = await supa
    .from('daily_attendance')
    .select('worker_id, target_date, role, site_declarations')
    .ilike('target_date', '2026-%')
    .limit(5)
  console.log('--- daily_attendance for 2026 ---')
  console.log(daData)
}
run()
