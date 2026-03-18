import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  console.log("Checking project connection...");
  const { data: proj, error: pErr } = await supabase.from('projects').select('*').limit(1);
  console.log("Projects:", proj?.length, pErr ? pErr.message : "OK");

  console.log("Checking assigned connections...");
  const { data: assign, error: aErr } = await supabase.from('assignments').select('id, project_id').limit(1);
  console.log("Assignments:", assign?.length, aErr ? aErr.message : "OK");

  if(assign && assign.length > 0) {
      console.log("Checking populated assignment...");
      const { data: pop, error: popErr } = await supabase.from('assignments').select(`
        id,
        project_id,
        project:projects ( id, project_name )
      `).limit(1);
      console.log("Populated assignment:", JSON.stringify(pop, null, 2), popErr ? popErr.message : "");
  }

  // Check Billing
  const { data: bill, error: bErr } = await supabase.from('billing_details').select('*').limit(1);
  console.log("Billing details:", bill?.length, bErr ? bErr.message : "OK");
}
test();
