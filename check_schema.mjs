import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://gsczefdkcrvudddeotlx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: cols } = await supabase.rpc('get_table_columns_by_name', { table_name: 'personnel' });
  console.log("personnel:", cols ? cols.map(c => c.column_name).join(", ") : "RPC might not exist");
  
  // Alternative way to check columns via a single select
  const tables = ['personnel', 'reports', 'report_workers', 'schedules', 'daily_attendance'];
  for (let t of tables) {
    const { data: d, error: e } = await supabase.from(t).select('*').limit(1);
    if (!e && d) {
       console.log(`Table ${t} columns:`, d.length > 0 ? Object.keys(d[0]).join(", ") : "empty table");
    } else {
       console.log(`Table ${t} error/absent:`, e ? e.message : 'no data');
    }
  }
}
check();
