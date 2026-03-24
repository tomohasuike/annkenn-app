import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

let envPath = '.env.local';
if (!fs.existsSync(envPath)) envPath = '.env';
dotenv.config({ path: envPath });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('global_memos').select('*');
  console.log("Global Memos Data:", data);
  if (error) console.error(error);
}
check();
