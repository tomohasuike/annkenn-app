import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  await supabase.from('manufacturers').upsert([{ name: '内外電機' }, { name: '日東工業' }]);
  console.log("Done inserting manufacturers.");
}
run();
