import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

(async () => {
    // Let's get columns manually for daily_attendance
    const { data: da, error: e1 } = await supabase.from('daily_attendance').select('*').limit(1);
    console.log("daily_attendance proto:", da);

    const { data: rp, error: e2 } = await supabase.from('report_personnel').select('*').limit(1);
    console.log("report_personnel proto:", rp);
})();
