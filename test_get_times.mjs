import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
(async () => {
    const { data: worker } = await supabase.from('worker_master').select('id, name').eq('name', '大金　正人').single();

    const { data: reportData, error } = await supabase
        .from('report_personnel')
        .select(`
          worker_id,
          start_time,
          end_time,
          daily_reports!inner(
            report_date,
            start_time,
            end_time,
            projects(project_name)
          )
        `)
        .eq('worker_id', worker.id)
        .gte('daily_reports.report_date', '2026-02-26');
    console.log("Dumping start times:");
    reportData.forEach(r => {
        let _r = Array.isArray(r.daily_reports) ? r.daily_reports[0] : r.daily_reports;
        let ws = r.start_time || _r?.start_time;
        console.log({
            start_time_rp: r.start_time,
            end_time_rp: r.end_time,
            start_time_dr: _r?.start_time,
            end_time_dr: _r?.end_time,
            ws
        })
    });
})();
