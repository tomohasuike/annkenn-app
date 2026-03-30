import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' })
const supa = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '')

async function run() {
  const { data: da1 } = await supa.from('daily_attendance').select('id, role').eq('role', '職長').limit(1)
  const { data: da2 } = await supa.from('report_personnel').select('id, role').eq('role', '職長').limit(1)
  console.log('daily_attendance 職長:', da1)
  console.log('report_personnel 職長:', da2)
  
  // also check if "鈴木" has any '職長' roles in report_personnel or daily_attendance
  const { data: wData } = await supa.from('workers').select('id, name').ilike('name', '%鈴木%').limit(1)
  const workerId = wData?.[0]?.id
  console.log('Suzuki ID:', workerId)
  
  if (workerId) {
      const { data: rpRoles } = await supa.from('report_personnel').select('role').eq('worker_id', workerId)
      const roleSet = new Set(rpRoles?.map(r => r.role))
      console.log('Suzuki report_personnel roles:', Array.from(roleSet))
      
      const { data: daData } = await supa.from('daily_attendance').select('site_declarations').eq('worker_id', workerId)
      let foundRoles = []
      daData?.forEach(d => {
          if (Array.isArray(d.site_declarations)) {
             d.site_declarations.forEach(sd => foundRoles.push(sd.role || sd.role_name))
          }
      })
      console.log('Suzuki site_declarations roles:', Array.from(new Set(foundRoles)))
  }
}
run()
