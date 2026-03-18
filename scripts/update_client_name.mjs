import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: ['.env.local', '.env'] })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function updateClientNames() {
  console.log('Fetching projects with category 川北 or BPE...')
  
  // Find 川北 projects
  const { data: kawakitaProjects, error: kErr } = await supabase
    .from('projects')
    .select('id, project_name, category, client_name')
    .eq('category', '川北')
    
  if (kErr) console.error('Error fetching 川北:', kErr)
  else {
    console.log(`Found ${kawakitaProjects.length} 川北 projects.`)
    for (const p of kawakitaProjects) {
      if (p.client_name !== '川北') {
         console.log(`Updating ${p.project_name} to client_name='川北'`)
         await supabase.from('projects').update({ client_name: '川北' }).eq('id', p.id)
      }
    }
  }

  // Find BPE projects
  const { data: bpeProjects, error: bErr } = await supabase
    .from('projects')
    .select('id, project_name, category, client_name')
    .eq('category', 'BPE')
    
  if (bErr) console.error('Error fetching BPE:', bErr)
  else {
    console.log(`Found ${bpeProjects.length} BPE projects.`)
    for (const p of bpeProjects) {
      if (p.client_name !== 'BPE') {
         console.log(`Updating ${p.project_name} to client_name='BPE'`)
         await supabase.from('projects').update({ client_name: 'BPE' }).eq('id', p.id)
      }
    }
  }
  
  console.log('Update complete.')
}

updateClientNames();
