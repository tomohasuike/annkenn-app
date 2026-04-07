import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
    const { data } = await supabase.from('materials').select('name, page_number, manufacturers!inner(name)').eq('manufacturers.name', 'ネグロス電工');
    console.log(data);
}
run();
