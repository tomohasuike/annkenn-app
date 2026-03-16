import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
    const { data, error } = await supabase.from('worker_master').select('*').eq('name', '池沢');
    if (error) {
        console.error("Select Error:", error);
        return;
    }
    console.log("Found:", data);
    if (data && data.length > 0) {
        const ids = data.map(d => d.id);
        const { error: delErr } = await supabase.from('worker_master').delete().in('id', ids);
        if (delErr) {
            console.error("Delete Error:", delErr);
        } else {
            console.log("Deleted IDs:", ids);
        }
    } else {
        console.log("No record found for '池沢'");
    }
}
main();
