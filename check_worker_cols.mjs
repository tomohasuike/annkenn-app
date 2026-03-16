import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.rpc('execute_sql_query', { query_text: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'worker_master'" });
  if (error) {
    // try direct select as fallback to see columns
    const { data: cols, error: errCols } = await supabase.from('worker_master').select('*').limit(1);
    console.log("Columns:", Object.keys(cols[0] || {}));
  } else {
    console.log(data);
  }
}
check();
