import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function alterVector() {
  const sql = `ALTER TABLE materials ALTER COLUMN embedding TYPE vector(3072);`;
  const { error } = await supabase.rpc('exec_raw_sql', { query: sql });
  if (error) console.error('Error altering column:', error);
  else console.log('Successfully altered embedding column to vector(3072)');
}
alterVector();
