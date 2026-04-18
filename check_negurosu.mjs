import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: mfs } = await supabase.from('manufacturers').select('*').eq('name', 'ネグロス電工');
  if (!mfs || mfs.length === 0) {
    console.log("Manufacturer not found.");
    return;
  }
  const { data: mats, error } = await supabase.from('materials').select('id, name, model_number').eq('manufacturer_id', mfs[0].id);
  console.log(`Materials found: ${mats ? mats.length : 0}`);
  if (mats && mats.length > 0) {
    console.log(mats.slice(0, 5));
  }
}
check();
