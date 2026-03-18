import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, project_id, billing_category, billing_subject, invoice_details(id, details_status, amount, expected_deposit_date, deposit_date)')
    .like('billing_subject', '%那須%');
  
  if (error) console.error(error);
  else console.dir(data, { depth: null });
}
check();
