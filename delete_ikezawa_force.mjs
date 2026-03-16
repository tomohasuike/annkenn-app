import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
    const workerId = 'f669335a-078f-40ad-afcd-8512b761bf02'; // '池沢' ID
    
    // Delete assignments
    const { error: asgnErr } = await supabase.from('assignments').delete().eq('worker_id', workerId);
    if (asgnErr) console.error("Error deleting assignments:", asgnErr);
    else console.log("Deleted assignments for '池沢'");
    
    // Delete from report personnel if exists
    const { error: rpErr } = await supabase.from('report_personnel').delete().eq('worker_id', workerId);
    if (rpErr) console.error("Error deleting report_personnel:", rpErr);
    else console.log("Deleted report_personnel records for '池沢'");
    
    // Delete the worker
    const { error: wkeErr } = await supabase.from('worker_master').delete().eq('id', workerId);
    if (wkeErr) console.error("Error deleting worker record:", wkeErr);
    else console.log("Deleted worker master record for '池沢'");
}
main();
