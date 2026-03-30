import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' })
const supa = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '')

async function run() {
  const { data: suzuki } = await supa.from('worker_master').select('id, name').eq('name', '鈴木　好幸').single()
  console.log('Worker:', suzuki?.name)
  
  if (suzuki) {
    const { data: assignments } = await supa
      .from('assignments')
      .select('assignment_date, projects(project_name)')
      .eq('worker_id', suzuki.id)
      .gte('assignment_date', '2026-03-01')
      .lte('assignment_date', '2026-03-31')

    const { data: reports } = await supa
      .from('report_personnel')
      .select('worker_id, daily_reports!inner(report_date, projects(project_name))')
      .eq('worker_id', suzuki.id)
      .gte('daily_reports.report_date', '2026-03-01')
      .lte('daily_reports.report_date', '2026-03-31')

    console.log('Assignments in Mar:', assignments?.filter(a => a.assignment_date.includes('03-08')))
    console.log('Reports in Mar:', reports?.filter(r => {
        const _r = Array.isArray(r.daily_reports) ? r.daily_reports[0] : r.daily_reports;
        return _r.report_date.includes('03-08')
    }))
  }
}

run()
