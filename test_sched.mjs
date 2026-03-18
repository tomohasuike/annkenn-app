import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import * as dateFns from 'date-fns'

dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  const todayStr = dateFns.format(new Date(), 'yyyy-MM-dd');
  const { data: schedules, error: err } = await supabase
    .from('assignments')
    .select(`
      id,
      project_id,
      assignment_date,
      worker_names,
      support_names,
      project:projects ( id, project_name, site_name, project_number )
    `)
    .eq('assignment_date', todayStr);
     console.log("Error:", err?.message);
}
test();
