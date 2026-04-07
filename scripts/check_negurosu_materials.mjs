import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
    const { data } = await supabase.from('materials').select('name, page_number').eq('manufacturer_id', 'a8e946a4-cf30-4e1b-8c5f-3acc71924614').limit(20); // Negurosu manufacturer ID? 
    console.log(data);
}
run();
