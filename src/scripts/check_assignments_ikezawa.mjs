import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve('.env.local') })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function run() {
  const { data: assignments, error } = await supabase
          .from('assignments')
          .select(`
            id,
            assignment_date,
            worker_id,
            worker_master (
              id,
              name,
              type
            )
          `)
  
  if (error) {
    console.error(error)
    return
  }
  
  const ikezawasan = assignments.filter(a => a.worker_master && a.worker_master.name && a.worker_master.name.includes('池沢'))
  console.log('Assignments for Ikezawa:', JSON.stringify(ikezawasan, null, 2))
}
run()
