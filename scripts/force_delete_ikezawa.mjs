import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('/Users/hasuiketomoo/Developer/annkenn-app/.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAndForceDelete() {
    console.log("Looking for Ikezawa...");
    const { data: ikezawas, error: err1 } = await supabase
        .from('worker_master')
        .select('*')
        .like('name', '%池沢%');

    if (!ikezawas || ikezawas.length === 0) {
        console.log("Not found in worker_master.");
        return;
    }

    const user = ikezawas[0];
    console.log(`Found: ${user.name} (ID: ${user.id})`);

    // Let's check common tables where reporter_id or similar is used
    const { data: dailyAsReporter } = await supabase.from('daily_reports').select('id').eq('reporter_id', user.id);
    console.log(`As reporter in daily_reports: ${dailyAsReporter?.length || 0}`);

    const { data: compAsReporter } = await supabase.from('completion_reports').select('id').eq('reporter', user.email);
    console.log(`As reporter in completion_reports: ${compAsReporter?.length || 0}`);

    // If there are daily reports where he is the reporter_id, we should nullify reporter_id so we can delete him.
    // The name is already saved as reporter_name.
    if (dailyAsReporter && dailyAsReporter.length > 0) {
        console.log("Nullifying reporter_id in daily_reports...");
        const { error: errUpdate } = await supabase
            .from('daily_reports')
            .update({ reporter_id: null })
            .eq('reporter_id', user.id);
        if (errUpdate) console.error("Failed to nullify in daily_reports:", errUpdate);
    }

    // Now try to delete again
    console.log("Attempting to delete from worker_master...");
    const { error: errDel } = await supabase
        .from('worker_master')
        .delete()
        .eq('id', user.id);

    if (errDel) {
        console.error("Delete failed:", errDel.message, errDel.details);
    } else {
        console.log("Successfully deleted from worker_master!");
    }
}

checkAndForceDelete();
