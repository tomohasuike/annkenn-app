import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

let envPath = '.env.local';
if (!fs.existsSync(envPath)) envPath = '.env';
dotenv.config({ path: envPath });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function restore() {
  const { data, error } = await supabase.from('global_memos').delete().eq('id', '32b9cba6-b1e7-43fe-bf13-cc593f912a6b');
  if (error) console.error("Delete Error:", error);
  
  const { data: remaining, error: selErr } = await supabase.from('global_memos').select('*').order('created_at', { ascending: true });
  console.log("Remaining Memos:", remaining);
}
restore();
