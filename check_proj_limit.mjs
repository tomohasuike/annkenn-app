import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, project_number')
    .order('created_at', { ascending: false })
    .limit(1000);
    
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  console.log("Total fetched:", data.length);
  const found = data.find(p => p.project_number === 'KD260110');
  console.log("Is KD260110 in the first 1000?:", !!found);
  if (found) {
    console.log("Project ID:", found.id);
  }
}

check();
