import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  const { data: sch } = await supabase.from('tomorrow_schedules').select('id, legacy_id');
  const { data: subs } = await supabase.from('tomorrow_subcontractors').select('id, schedule_legacy_id').is('schedule_id', null);
  
  if (!sch || !subs) return;
  
  const scheduleMap = new Map();
  sch.forEach(s => {
      if (s.legacy_id) scheduleMap.set(s.legacy_id.trim(), s.id);
  });
  
  let updatedCount = 0;
  for (const sub of subs) {
      if (!sub.schedule_legacy_id) continue;
      const sid = scheduleMap.get(sub.schedule_legacy_id.trim());
      if (sid) {
          const { error } = await supabase.from('tomorrow_subcontractors').update({ schedule_id: sid }).eq('id', sub.id);
          if (!error) updatedCount++;
          else console.error(error);
      }
  }
  
  console.log(`Total subcontractors securely updated: ${updatedCount}`);
}
fix();
