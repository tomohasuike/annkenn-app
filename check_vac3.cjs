const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/Users/hasuiketomoo/Developer/annkenn-app/.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
    const { data: assignments } = await supabase.from('assignments')
        .select('id, project_id, assignment_date, worker_master!inner(name)')
        .gte('assignment_date', '2026-03-10');
        
    const filtered = assignments.filter(a => ['大島', '大金'].some(n => a.worker_master.name.includes(n))).slice(0, 10);
    console.log("Recent assignments for 大島/大金:", JSON.stringify(filtered, null, 2));

    const pids = [...new Set(filtered.map(f => f.project_id))];
    const { data: pdata } = await supabase.from('projects').select('id, project_name').in('id', pids);
    console.log("\nProject Details:", JSON.stringify(pdata, null, 2));
}
main();
