import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  try {
    console.log('Fetching projects...')
    const { data: pData, error: pError } = await supabase.from('projects').select('id, project_name').limit(1)
    if (pError) console.error('Projects Error:', pError)
    else console.log('Projects Success:', JSON.stringify(pData))

    console.log('Fetching daily_reports with project relation...')
    const { data: dData, error: dError } = await supabase.from('daily_reports').select('id, projects(project_number, project_name)').limit(1)
    if (dError) console.error('Daily Reports Error:', dError)
    else console.log('Daily Reports Success:', JSON.stringify(dData))
    
  } catch (err) {
    console.error('Catch Error:', err)
  }
}

test()
