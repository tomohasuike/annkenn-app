import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
    console.log("Checking daily_reports for completion report fields...");
    const { data: cols1 } = await supabase.rpc('get_table_columns_v2', { target_table: 'daily_reports' });
    if(cols1) {
        console.log("Daily Reports Cols:", cols1.map(c => c.column_name));
    } else {
        const { data: r1 } = await supabase.from('daily_reports').select('*').limit(1);
        console.log("Daily Reports keys:", r1 && r1[0] ? Object.keys(r1[0]) : "None");
    }

    const { data: r2 } = await supabase.from('projects').select('*').limit(1);
    console.log("Projects keys:", r2 && r2[0] ? Object.keys(r2[0]) : "None");
}
main();
