import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  console.log("Checking projects...")
  const { data: pData, error: pError } = await supabase.from('projects').select('id, project_name').limit(1)
  console.log(pError ? "Error: " + pError.message : "Success")

  console.log("Checking daily_reports with relation...")
  const { data: dData, error: dError } = await supabase.from('daily_reports').select('id, projects!inner (project_number, project_name)').limit(1)
  console.log(dError ? "Error: " + dError.message : "Success: " + JSON.stringify(dData))
}

test()
