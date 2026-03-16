import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  const { data: vacProj, error: errVac } = await supabase.from('projects').insert([{
    project_name: '休暇',
    legacy_id: 'vacation',
    status: '準備中'
  }]).select().single()
  
  if (errVac) console.error("Error creating vacation project:", errVac)
  else console.log("Created vacation project:", vacProj)
}
fix()
