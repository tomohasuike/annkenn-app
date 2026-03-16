import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://gsczefdkcrvudddeotlx.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzY3plZmRrY3J2dWRkZGVvdGx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODU2MzcsImV4cCI6MjA4ODc2MTYzN30.N-mPmVKlDQGzZ57EvrWuCd2VviuK0lTTRHsBPCC0Frs');
async function run() {
  const { data, error } = await supabase.from('daily_reports')
    .select('id, site_photos')
    .not('site_photos', 'is', null);
  
  if (error) { console.error(error); return; }
  let unmigrated = 0;
  let migrated = 0;
  for (const row of data) {
    if (row.site_photos.includes('[')) migrated++;
    else {
        unmigrated++;
        if (unmigrated <= 3) {
            console.log('Sample Unmigrated Path:', row.site_photos);
        }
    }
  }
  console.log('Migrated:', migrated, 'Unmigrated (Legacy Paths):', unmigrated);
  process.exit(0);
}
run();
