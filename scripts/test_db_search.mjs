import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('Missing config. Exiting.');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const kw = 've';
  let dbQuery = supabase
    .from('materials')
    .select()
    .limit(5);

  dbQuery = dbQuery.or();

  const { data, error } = await dbQuery;
  console.log('Error:', error);
  console.log('Data:', data);
}
test();
