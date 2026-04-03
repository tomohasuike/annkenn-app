require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: latest } = await supabase.from('daily_reports').select('id').order('created_at', { ascending: false }).limit(1);
  if (!latest || latest.length === 0) return console.log('no reports');
  const report_id = latest[0].id;
  const { error } = await supabase.from('report_materials').insert([{
    report_id,
    material_name: 'test material',
    quantity: '10'
  }]);
  console.log('Insert Error:', error);
  await supabase.from('report_materials').delete().eq('material_name', 'test material');
}
run();
