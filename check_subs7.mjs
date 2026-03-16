import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: sch } = await supabase.from('tomorrow_schedules').select('id, legacy_id');
  const { data: subs } = await supabase.from('tomorrow_subcontractors').select('id, schedule_legacy_id');
  
  if (!sch || !subs) return;
  
  const legacyIds = new Set(sch.map(s => s.legacy_id).filter(Boolean));
  let matched = 0;
  let orphaned = 0;
  
  for (const sub of subs) {
      if (legacyIds.has(sub.schedule_legacy_id)) {
          matched++;
      } else {
          orphaned++;
      }
  }
  
  console.log(`Matched: ${matched}, Orphaned: ${orphaned}`);
}
check();
