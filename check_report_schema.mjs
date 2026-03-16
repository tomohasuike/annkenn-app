import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function check() {
  const { data, error } = await supabase.from('report_materials').select('*').limit(1)
  if (error) {
    console.error(error)
    return
  }
  if (data.length > 0) {
    console.log("Columns:", Object.keys(data[0]))
  } else {
    // If empty, let's insert a dummy row then delete it to see the schema, or just use rpc if available.
    // Better yet, just insert an empty object and see the error message which usually contains column names, or use the undocumented 'head' behavior.
    console.log("Table is empty.")
  }
}
check()
