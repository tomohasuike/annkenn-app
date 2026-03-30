import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' })
const supa = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '')

async function run() {
  const workerSearch = '鈴木'
  const { data: wData } = await supa.from('workers').select('id, name').ilike('name', `%${workerSearch}%`).limit(1)
  const workerId = wData?.[0]?.id
  console.log('Worker:', wData?.[0]?.name, workerId)

  if (workerId) {
    const { data: rpData } = await supa
      .from('report_personnel')
      .select(`worker_id, start_time, end_time, role, daily_reports(report_date, projects(project_name))`)
      .eq('worker_id', workerId)
      .eq('daily_reports.report_date', '2025-03-24')
    console.log('--- report_personnel for 3/24 ---')
    console.dir(rpData, { depth: null })

    const { data: daData } = await supa
      .from('daily_attendance')
      .select('*')
      .eq('worker_id', workerId)
      .eq('target_date', '2025-03-24')
    console.log('--- daily_attendance for 3/24 ---')
    console.dir(daData?.[0]?.site_declarations, { depth: null })
    console.log('DA role:', daData?.[0]?.role)
  }
}
run()
