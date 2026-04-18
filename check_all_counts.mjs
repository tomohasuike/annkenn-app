import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: mfs } = await supabase.from('manufacturers').select('*');
  for (const m of mfs) {
    const { count } = await supabase.from('materials').select('*', { count: 'exact', head: true }).eq('manufacturer_id', m.id);
    console.log(`${m.name}: ${count}件`);
  }
}
check();
