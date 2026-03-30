import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' })
const supa = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '')

async function run() {
  const { data: daData } = await supa
    .from('daily_attendance')
    .select('worker_id, target_date, role, site_declarations')
    .neq('role', '一般')
    .limit(5)
  console.log('--- daily_attendance with role != 一般 ---')
  console.dir(daData, { depth: null })

  const { data: rpData } = await supa
    .from('report_personnel')
    .select('worker_id, role, start_time, end_time, daily_reports(report_date, projects(project_name))')
    .neq('role', '一般')
    .limit(5)
  console.log('\n--- report_personnel with role != 一般 ---')
  console.dir(rpData, { depth: null })
}
run()
