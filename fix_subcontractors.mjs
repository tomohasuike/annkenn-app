import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  // Get all schedules that have a legacy_id
  const { data: schedules, error: schError } = await supabase.from('tomorrow_schedules').select('id, legacy_id').not('legacy_id', 'is', null);
  
  if (schError) {
      console.error("Error fetching schedules:", schError);
      return;
  }
  
  console.log("Schedules with legacy_id:", schedules?.length);
  
  if (!schedules || schedules.length === 0) return;
  
  let updatedCount = 0;
  for (const schedule of schedules) {
      const { data: subs } = await supabase.from('tomorrow_subcontractors')
          .select('id, schedule_id, schedule_legacy_id')
          .eq('schedule_legacy_id', schedule.legacy_id)
          .is('schedule_id', null);
          
      if (subs && subs.length > 0) {
          console.log(`Matching subs for schedule ${schedule.id} (legacy ${schedule.legacy_id}):`, subs.length);
          for (const sub of subs) {
              await supabase.from('tomorrow_subcontractors').update({ schedule_id: schedule.id }).eq('id', sub.id);
              updatedCount++;
          }
      }
  }
  console.log("Total subcontractors updated:", updatedCount);
}
fix();
