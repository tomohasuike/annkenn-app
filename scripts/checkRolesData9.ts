import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' })
const supa = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '')

async function run() {
  const { data: daData, error } = await supa
    .from('daily_attendance')
    .select('worker_id, target_date, role, site_declarations')
    .gte('target_date', '2026-03-20')
    .lte('target_date', '2026-03-31')
    .not('role', 'is', null) // only if they have a role

  console.log('--- daily_attendance for late march 2026 ---')
  if (error) console.error(error)
  const nonGeneral = daData?.filter(d => d.role !== '一般') || []
  console.log('Total records:', daData?.length)
  console.log('Records with role != 一般:', nonGeneral.length)
  if (nonGeneral.length > 0) {
     console.log('Sample non-general:', nonGeneral[0])
  } else if (daData && daData.length > 0) {
     console.log('Sample record:', daData[0])
  }
}
run()
