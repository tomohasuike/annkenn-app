import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
    console.log("Checking worker_master...");
    const { data: w } = await supabase.from('worker_master').select('id, name');
    console.log("All current workers:", w.map(r => r.name));
}
main();
