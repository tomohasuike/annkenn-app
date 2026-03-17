import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('/Users/hasuiketomoo/Developer/annkenn-app/.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteIkezawa() {
    console.log("Looking for Ikezawa...");
    const { data: ikezawas } = await supabase.from('worker_master').select('*').like('name', '%池沢%');

    if (!ikezawas || ikezawas.length === 0) {
        console.log("Not found.");
        return;
    }

    const user = ikezawas[0];
    console.log(`Found: ${user.name} (ID: ${user.id})`);

    console.log("Deleting assignments for this user...");
    const { error: errAss } = await supabase.from('assignments').delete().eq('worker_id', user.id);
    if (errAss) {
        console.error("Failed to delete assignments:", errAss.message);
        return;
    }
    console.log("Assignments deleted.");

    console.log("Attempting to delete from worker_master...");
    const { error: errDel } = await supabase.from('worker_master').delete().eq('id', user.id);
    if (errDel) {
         console.error("Delete failed:", errDel.message, errDel.details);
         // If there are other FKs, let's catch them
    } else {
         console.log("Successfully deleted Ikezawa from the entire system!");
    }
}

deleteIkezawa();
