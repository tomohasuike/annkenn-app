import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: vehicles, error } = await supabase
    .from('vehicle_master')
    .select('*')
    .order('vehicle_name');

  if (error) {
    console.error("Error fetching vehicles:", error);
    return;
  }

  for (const v of vehicles) {
    let type = 'vehicle'; // Default to work vehicle
    
    // Check if it's construction machinery based on keywords
    if (v.vehicle_name.includes('ユンボ') || 
        v.vehicle_name.includes('バックホー') || 
        v.vehicle_name.includes('クレーン') ||
        v.vehicle_name.includes('ダンプ') ||
        v.vehicle_name.includes('ローラー') ||
        v.vehicle_name.includes('発電機')) {
      type = 'machine';
    }

    // Update the database with the new type field (assuming we add a 'vehicle_type' column or just modify the UI logic)
    // Actually, looking at the previous logic, the UI was deciding this based on `!v.vehicle_name.includes('作業車')`.
    // Instead of relying on name includes, it's better to add a `vehicle_type` column to `vehicle_master` to store 'vehicle' or 'machine'.
  }
}

main();
