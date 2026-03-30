import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

(async () => {
    // 宇都宮駐屯地の消防設備工事 is on 2/27 and 3/2
    const { data: reports, error } = await supabase
        .from('daily_reports')
        .select(`
            id,
            report_date,
            start_time,
            end_time,
            projects(project_name),
            report_personnel(worker_id, start_time, end_time)
        `)
        .ilike('projects.project_name', '%宇都宮駐屯地%')
        .gte('report_date', '2026-02-26');

    if (error) {
        console.error(error);
        return;
    }

    console.log(JSON.stringify(reports.filter(r => r.projects !== null), null, 2));
})();
