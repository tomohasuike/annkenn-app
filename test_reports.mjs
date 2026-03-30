import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const { data: users } = await supabase.from('workers').select('id, name').limit(5);
    console.log("Found workers:", users);

    const wId = users[0].id;
    console.log("Testing for worker:", users[0].name, wId);

    const { data: reportsData, error } = await supabase
      .from('daily_reports')
      .select(`
        id,
        report_date,
        project_id,
        projects ( project_name ),
        report_personnel!inner ( worker_id, start_time, end_time )
      `)
      .eq('report_personnel.worker_id', wId)
      .gte('report_date', '2026-03-01')
      .lte('report_date', '2026-03-31');

    console.log("Reports Error:", error);
    console.log("Reports Data Length:", reportsData?.length);
    console.log("First Report:", JSON.stringify(reportsData?.[0], null, 2));
}
run();
