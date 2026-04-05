import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const { data, error } = await supabase.from('daily_reports')
.select('id, report_date, created_at, work_category, projects!inner(project_name)')
.ilike('projects.project_name', '%動物舎天吊型%');
if (error) console.error(error);
console.log(JSON.stringify(data.filter(d => ['2026-03-13', '2026-03-14', '2026-03-16'].includes(d.report_date)).map(r => ({ date: r.report_date, created: r.created_at, category: r.work_category })), null, 2));
