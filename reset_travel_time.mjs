import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  console.log("Resetting travel_time_minutes and prep_time_minutes to 0...");
  
  // We'll update the recent data assuming we want to wipe it
  const { data, error } = await supabase
    .from('daily_attendance')
    .update({ travel_time_minutes: 0, prep_time_minutes: 0 })
    .gte('target_date', '2025-01-01');
    
  if (error) {
    console.error("Error updating:", error);
  } else {
    console.log("Successfully reset move/prep times!");
  }
}
run();
