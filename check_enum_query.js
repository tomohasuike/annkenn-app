import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    // try to just query a known worker table and get its format
    const { data: d1 } = await supabase.from('worker_master').select('*').limit(1);
    console.log(d1);
}
run()
