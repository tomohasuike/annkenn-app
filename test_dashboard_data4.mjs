import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  const { data, error } = await supabase.rpc('get_tables_list')
  if(error) {
     console.log("no rpc. Let's try select from billing");
     const {data: b, error: e2} = await supabase.from('billings').select('*').limit(1);
     console.log('billings:', b ? b.length : e2.message);
  } else {
    console.log(data);
  }
}
test();
