const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('projects')
    .select('id, project_number, client_company_name')
    .limit(5);
  
  if (error) console.error(error);
  console.log(data);
}
check();
