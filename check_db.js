import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase.from('projects').select('id, project_name').limit(1)
  console.log("Fetch projects result:", { data, error })
  
  const { data: dData, error: dError } = await supabase.from('daily_reports').select('id, projects(project_name)').limit(1)
  console.log("Fetch daily_reports result:", { dData, dError })
}

test()
