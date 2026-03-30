import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
    const { data } = await supabase.from('daily_reports').select('id, reporter_name, report_date, site_photos').not('site_photos', 'is', null);
    let count = 0;
    for (const d of data) {
        if (d.site_photos.includes('drive-storage')) {
            count++;
            console.log(d.report_date, d.reporter_name);
        }
    }
    console.log("Total broken records:", count);
}
check();
