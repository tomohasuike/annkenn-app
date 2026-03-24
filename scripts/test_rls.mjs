import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testRLS() {
  console.log('Testing SELECT project_daily_data...');
  const { data: selectData, error: selectErr } = await supabase.from('project_daily_data').select('*').limit(1);
  console.log('SELECT project_daily_data:', selectData ? 'Success' : 'Failed', selectErr);

  console.log('Testing UPDATE project_daily_data...');
  const { data: updateData, error: updateErr } = await supabase.from('project_daily_data')
    .update({ comment: 'test' })
    .eq('id', selectData?.[0]?.id || '00000000-0000-0000-0000-000000000000')
    .select();
  console.log('UPDATE project_daily_data:', updateData ? 'Success' : 'Failed', updateErr);
}

testRLS();
