import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config({ path: '.env.local' })
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  const fileContent = fs.readFileSync('src/pages/BillingForm.tsx', 'utf-8');
  const tableMatches = fileContent.match(/from\('([^']+)'/g);
  console.log("Tables found in BillingForm:", tableMatches);
}
test();
