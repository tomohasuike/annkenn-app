import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkCount() {
  const { data, error } = await supabase
    .from('manufacturers')
    .select('id, name');
    
  console.log('MANUFACTURERS:', data);
  console.log('ERROR:', error);
}

checkCount().catch(console.error);
