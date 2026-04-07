import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, count, error } = await supabase
    .from('materials')
    .select('id', { count: 'exact', head: true });
    
  console.log('COUNT:', count);
  console.log('ERROR:', error);
}
check();
