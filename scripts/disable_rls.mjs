import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testPrivileges() {
  const { error } = await supabase.rpc('exec_raw_sql', { query: `ALTER TABLE manufacturers DISABLE ROW LEVEL SECURITY; ALTER TABLE materials DISABLE ROW LEVEL SECURITY;` });
  console.log('DISABLE RLS ERROR:', error);
}

testPrivileges();
