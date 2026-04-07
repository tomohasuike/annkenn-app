import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkCount() {
  console.log('Fetching count...');
  const { data, count, error } = await supabase
    .from('materials')
    .select('id', { count: 'exact', head: true });
    
  console.log('COUNT:', count);
  console.log('ERROR:', error);
}

checkCount().catch(console.error);
