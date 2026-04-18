import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: mfs } = await supabase.from('manufacturers').select('*').eq('name', 'ネグロス電工');
  if (!mfs || mfs.length === 0) return;
  const { count, error } = await supabase.from('materials').select('*', { count: 'exact', head: true }).eq('manufacturer_id', mfs[0].id);
  console.log(`Total Neguros Materials: ${count}`);
}
check();
