require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  try {
    const { data: pData, error: pErr } = await supabase.from('projects').select('id, category').eq('category', '役所');
    if (pErr) throw pErr;
    
    const projectIds = pData.map(p => p.id);
    if (projectIds.length === 0) {
      console.log('No yakusho projects found');
      return;
    }
    
    // FETCH ALL yakusho reports
    const { data: reports, error: rErr } = await supabase.from('daily_reports')
      .select('id, work_category, report_personnel(id)')
      .in('project_id', projectIds);
    if (rErr) throw rErr;
    
    let single = 0, multi = 0, zero = 0;
    let upCount = 0;
    
    for (const r of reports) {
      const pCount = r.report_personnel ? r.report_personnel.length : 0;
      if (pCount === 0) zero++;
      else if (pCount === 1) {
          single++;
          // UPDATE TO 管理
          const { error: uErr } = await supabase.from('daily_reports').update({ work_category: '管理' }).eq('id', r.id);
          if (uErr) throw uErr;
          upCount++;
      }
      else multi++;
    }
    console.log(`Summary: Zero=${zero}, Single=${single}, Multi=${multi}`);
    console.log(`Updated ${upCount} reports to 管理`);
  } catch(e) {
    console.error('Error:', e);
  }
}

run();
