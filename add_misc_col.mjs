import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://xofikctovjylpfxpmlzy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

if (!supabaseUrl || !supabaseKey) {
  console.log('No supabase url or key found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addCol() {
  const { data, error } = await supabase.rpc('exec_sql', { sql_string: 'ALTER TABLE daily_attendance ADD COLUMN IF NOT EXISTS misc_time_minutes INTEGER DEFAULT 0;' });
  if (error) {
    console.error('Via RPC exec_sql failed:', error);
    // Let's try raw postgres via pg module just in case? Or we can't because we don't have db string.
  }
}
addCol();
