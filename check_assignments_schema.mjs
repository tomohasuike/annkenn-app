import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({path: '.env.local'});

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data, error } = await supabase.from('assignments').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample row:', JSON.stringify(data[0], null, 2));
  }
}

main();
