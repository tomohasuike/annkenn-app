require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data } = await supabase.from('daily_reports').select('id, created_at, report_date, work_category').in('work_category', ['工事', '管理']);
  const importedDates = data.filter(r => r.created_at.startsWith('2026-03-16T01:4'));
  console.log(`Found ${importedDates.length} reports created between 01:40 and 01:49 UTC on Mar 16.`);
}
run();
