import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  const { data, error } = await supabase.from('projects').select('*').limit(1);
  if (data && data.length > 0) {
      console.log(Object.keys(data[0]));
  } else {
      console.log("No data or error:", error);
  }
}
test();
