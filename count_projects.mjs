import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl) throw new Error("Missing URL");

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  console.log("Fetching...");
  const { data, count, error } = await supabase.from('projects').select('*', { count: 'exact' });
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  console.log("Projects Count:", count);
  console.log("Data length:", data.length);
}
check();
