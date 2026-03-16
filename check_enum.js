import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const { data, error } = await supabase.rpc('get_enum_values', { enum_name: 'worker_type' })
    if (error) console.log("RPC Error:", error.message)
    else console.log("Enum values via RPC:", data)
}
run()
