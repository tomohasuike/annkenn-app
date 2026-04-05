require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  try {
    const { data: pData } = await supabase.from('projects').select('id, category').eq('category', '役所');
    const projectIds = pData.map(p => p.id);
    
    // We want to see all reports in yakusho projects that are currently "管理"
    const { data: reports } = await supabase.from('daily_reports')
      .select('id, work_category, created_at, report_personnel(id)')
      .in('project_id', projectIds)
      .eq('work_category', '管理');

    let singleKanri = reports.filter(r => r.report_personnel && r.report_personnel.length === 1);
    
    // Group by created_at date
    const dateCounts = {};
    singleKanri.forEach(r => {
        const dateStr = r.created_at.substring(0, 10);
        dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
    });
    console.log('Creation dates of Single-worker Management reports:', dateCounts);
  } catch(e) {
    console.error(e);
  }
}
run();
