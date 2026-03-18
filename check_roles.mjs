import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, role_id, user_roles(*)')
  
  if (error) {
    console.error('Error fetching profiles:', error)
  } else {
    // Show user Miyoko Hasuike or similar
    console.log(JSON.stringify(profiles.filter(p => JSON.stringify(p).includes('蓮池') || JSON.stringify(p).includes('hasuike')), null, 2))
  }
}

check()
