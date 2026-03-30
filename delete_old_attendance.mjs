import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Fetching attendance records before 2026-01-25...");
    const { data: records, error: fetchErr } = await supabase
        .from('daily_attendance')
        .select('id, target_date, worker_id, target_date')
        .lt('target_date', '2026-01-25');
        
    if (fetchErr) {
        console.error("Fetch error:", fetchErr);
        return;
    }
    
    console.log(`Found ${records.length} records to delete.`);
    
    if (records.length === 0) return;
    
    const { error: delErr } = await supabase
        .from('daily_attendance')
        .delete()
        .lt('target_date', '2026-01-25');
        
    if (delErr) {
        console.error("Delete error:", delErr);
        return;
    }
    
    console.log(`Successfully deleted ${records.length} records from daily_attendance before 2026-01-25.`);
}

run();
