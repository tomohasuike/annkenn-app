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
      .eq('assignment_date', '2026-03-08')

    console.log('Assignments on Sunday (3/8):', JSON.stringify(assignments, null, 2))
    
    const { data: reports } = await supa
      .from('report_personnel')
      .select('worker_id, daily_reports!inner(report_date, projects(project_name))')
      .eq('worker_id', suzuki.id)
      .eq('daily_reports.report_date', '2026-03-08')

    console.log('Reports on Sunday (3/8):', JSON.stringify(reports, null, 2))
  }
}

run()
