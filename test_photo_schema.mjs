import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function check() {
  const { data: reports } = await supabase.from('daily_reports').select('id, site_photos').not('site_photos', 'is', null).limit(1)
  console.log("Report site_photos:", reports ? reports[0] : null)
  const { data: mats } = await supabase.from('report_materials').select('id, photo, documentation').not('photo', 'is', null).limit(1)
  console.log("Material photo:", mats ? mats[0] : null)
  
  const { data: rCols } = await supabase.rpc('query_columns', { table_name: 'daily_reports' }).catch(() => ({data: []}))
}
check()
