require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: pData } = await supabase.from('projects').select('id, category').eq('category', '役所');
  const projectIds = pData.map(p => p.id);
  
  const { data: reports } = await supabase.from('daily_reports')
    .select('id, work_category, created_at, report_personnel(id)')
    .in('project_id', projectIds)
    .eq('work_category', '管理');

  let revertCount = 0;
  for (const r of reports) {
      if (r.report_personnel && r.report_personnel.length === 1 && !r.created_at.startsWith('2026-03-16T01:4')) {
          revertCount++;
          await supabase.from('daily_reports').update({ work_category: '工事' }).eq('id', r.id);
      }
  }
  
  console.log(`Successfully reverted ${revertCount} reports back to 工事.`);
}
run();
