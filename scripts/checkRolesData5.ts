import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' })
const supa = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '')

async function run() {
  const { data: wData } = await supa.from('worker_master').select('*')
  console.log('Worker count:', wData?.length)

  const { data: rpData } = await supa
    .from('report_personnel')
    .select('role, daily_reports!inner(report_date)')
    .eq('daily_reports.report_date', '2026-03-24')

  console.log('report_personnel on 3/24:', rpData)
}
run()
