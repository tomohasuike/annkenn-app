import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import * as dateFns from 'date-fns'

dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  const todayStr = dateFns.format(new Date(), 'yyyy-MM-dd');
  console.log("Today:", todayStr);

  const { data, error } = await supabase
    .from('invoice_details')
    .select('id, amount, billing_date, expected_deposit_date, details_status')
    .not('details_status', 'eq', '完了');
    
  if (error) {
      console.log("Error:", error);
      return;
  }
  
  console.log("Total open invoice details:", data.length);
  
  const overdue = data.filter(bd => {
      // Logic from Dashboard.tsx lines 114-117
      return bd.expected_deposit_date && bd.expected_deposit_date < todayStr && bd.details_status === '請求済';
  });
  console.log("Found Overdue (Dashboard Logic):", overdue.length);
  
  // What are the actual statuses?
  const statuses = {};
  data.forEach(bd => {
      statuses[bd.details_status] = (statuses[bd.details_status] || 0) + 1;
  });
  console.log("Statuses of open invoices:", statuses);
  
  // Show all old deposit dates
  const pastDates = data.filter(bd => bd.expected_deposit_date && bd.expected_deposit_date < todayStr);
  console.log(`Open invoices with expected_deposit_date < ${todayStr}:`, pastDates.length);
  pastDates.slice(0, 3).forEach(bd => console.log(`  - status ${bd.details_status}, date: ${bd.expected_deposit_date}`));
}
test();
