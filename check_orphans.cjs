const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
    console.log("Looking for orphaned records...");
    const { data: orphans } = await supabase.from('assignments').select('id, worker_id, assignment_date').is('project_id', null).gte('assignment_date', '2026-03-01');
    console.log("Orphaned assignments:", orphans?.length);

    const { data: pdata } = await supabase.from('project_daily_data').select('id, target_date, comment').is('project_id', null).gte('target_date', '2026-03-01');
    console.log("Orphaned daily data:", pdata?.length);

    const { data: all_vac } = await supabase.from('projects').select('id, project_name, legacy_id').ilike('project_name', '%休暇%');
    console.log("All projects with 休暇 in name:", all_vac);
}
main();
