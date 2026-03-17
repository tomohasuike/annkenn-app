import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  const { data, error } = await supabase.from('projects').select('id, project_name, category').ilike('project_name', '%UNION%')
  console.log("Error:", error)
  console.log("Projects matching UNION:", data)
}
test()
