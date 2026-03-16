import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: subs } = await supabase.from('tomorrow_subcontractors')
      .select('id, schedule_id, schedule_legacy_id')
      .is('schedule_id', null)
      .limit(5);
  
  console.log("Subs without schedule_id:", subs);
  
  if (subs && subs.length > 0) {
      const legacyId = subs[0].schedule_legacy_id;
      const { data: sch } = await supabase.from('tomorrow_schedules').select('id, legacy_id').eq('legacy_id', legacyId);
      console.log(`Searching schedule for legacy_id '${legacyId}':`, sch);
  }
}
check();
