import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  // Login to simulate frontend user
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'tomo.hasuike@hitec-inc.co.jp',
    password: 'dummy_password_just_for_test' // We can't actually login with oauth via script easily, but we can check RLS rules if we bypass it.
  })
  
  // Actually, let's just use the anon key. If RLS blocks anon, and we didn't add a policy for authenticated, it blocks them too.
  const { data, error } = await supabase.from('worker_master').select('name').eq('email', 'tomo.hasuike@hitec-inc.co.jp').single()
  console.log("Anon/Public read error:", error)
  console.log("Anon/Public read data:", data)
}

test()
