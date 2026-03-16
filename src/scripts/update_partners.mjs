import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

const partners = ['池沢', '石塚住設', '小林（晃）', '小林清', '星野', '横山']

async function updatePartners() {
  console.log('Fetching current workers...')
  const { data: workers, error: fetchErr } = await supabase
    .from('worker_master')
    .select('id, name, type')
    
  if (fetchErr) {
    console.error('Error fetching workers:', fetchErr)
    return
  }

  const workersToUpdate = workers.filter(w => partners.some(p => w.name.includes(p)))
  
  console.log(`Found ${workersToUpdate.length} workers to update:`, workersToUpdate.map(w => w.name))

  for (const worker of workersToUpdate) {
    const { error: updateErr } = await supabase
      .from('worker_master')
      .update({ type: '協力会社' })
      .eq('id', worker.id)

    if (updateErr) {
      console.error(`Failed to update ${worker.name}:`, updateErr)
    } else {
      console.log(`Successfully updated ${worker.name} to '協力会社'`)
    }
  }
}

updatePartners()
