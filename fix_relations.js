import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve('/Users/hasuiketomoo/Developer/annkenn-app/.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function fixRelations() {
  const tables = ['report_personnel', 'report_vehicles', 'report_machinery', 'report_materials', 'report_subcontractors']
  
  // 1. Get all daily reports with legacy_id
  const { data: reports } = await supabase.from('daily_reports').select('id, legacy_id').not('legacy_id', 'is', null)
  console.log(`Found ${reports.length} daily reports with legacy_ids`)
  
  // Create a mapping
  const reportMap = {}
  reports.forEach(r => { reportMap[r.legacy_id] = r.id })
  
  for (const table of tables) {
    // Get unlinked records that have a report_legacy_id
    const { data: unlinked } = await supabase.from(table).select('id, report_legacy_id').is('report_id', null).not('report_legacy_id', 'is', null)
    
    if (!unlinked || unlinked.length === 0) {
      console.log(`No unlinked records with legacy ID in ${table}`)
      continue
    }
    
    console.log(`Found ${unlinked.length} unlinked records in ${table}, fixing...`)
    
    let fixed = 0
    for (const record of unlinked) {
      const properReportId = reportMap[record.report_legacy_id]
      if (properReportId) {
        await supabase.from(table).update({ report_id: properReportId }).eq('id', record.id)
        fixed++
      }
    }
    console.log(`Fixed ${fixed} records in ${table}`)
  }
}

fixRelations().then(() => console.log('Done')).catch(console.error)
