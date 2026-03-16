import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
    const { data: w } = await supabase.from('worker_master').select('id').eq('name', '池沢').single();
    if (!w) {
        console.log("No 池沢 to check.");
        return;
    }
    const { data: assignments } = await supabase.from('assignments').select('id, assignment_date').eq('worker_id', w.id);
    console.log("Assignments for '池沢':", assignments?.length || 0);

    // If there are very few, we might just delete them so we can delete the record.
    // Or we could rename to '池沢 (不要)' and deactivate it.
}
main();
