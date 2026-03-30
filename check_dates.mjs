import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Fetching attendance records in 2026-01 and 2026-02...");
    const { data: records, error: fetchErr } = await supabase
        .from('daily_attendance')
        .select('target_date')
        .order('target_date', { ascending: true });
        
    if (fetchErr) {
        console.error("Fetch error:", fetchErr);
        return;
    }
    
    // summarize by date
    const counts = {};
    for (const r of records) {
        counts[r.target_date] = (counts[r.target_date] || 0) + 1;
    }
    
    for (const date of Object.keys(counts).sort()) {
        console.log(`${date}: ${counts[date]} records`);
    }
}

run();
