const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('projects')
    .select('project_name, client_name, client_company_name')
    .not('client_company_name', 'is', null)
    .not('client_company_name', 'eq', '')
    .limit(5);
  
  if (error) console.error(error);
  console.log(data);
}
check();
