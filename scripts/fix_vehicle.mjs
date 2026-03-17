import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: ['.env.local', '.env'] })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixDuplicates() {
  console.log('Fetching 新5001 vehicles...')
  const { data: vehicles, error } = await supabase
    .from('vehicle_master')
    .select('*')
    .or('vehicle_name.ilike.%5001%,vehicle_name.ilike.%５００１%')
  
  if (error) {
    console.error('Error fetching vehicles:', error)
    return
  }

  console.log('Found vehicles:', vehicles)
  
  if (vehicles.length < 2) {
      console.log('No duplicates found. Exiting.')
      return;
  }
  
  // Keep the first one, delete the rest
  const keepVehicleId = vehicles[0].id
  const deleteVehicleIds = vehicles.slice(1).map(v => v.id)
  
  console.log(`Keeping vehicle ID: ${keepVehicleId}`);
  console.log(`Deleting vehicle IDs:`, deleteVehicleIds);
  
  for (const delId of deleteVehicleIds) {
      console.log(`Checking references for ${delId}...`);
      
      // Update assignments
      const { data: asgs, error: checkErr } = await supabase.from('assignments').select('id').eq('vehicle_id', delId);
      if (checkErr) console.error(checkErr);
      if (asgs && asgs.length > 0) {
          console.log(`Found ${asgs.length} assignments. Updating to ${keepVehicleId}...`);
          const { error: updErr } = await supabase.from('assignments').update({ vehicle_id: keepVehicleId }).eq('vehicle_id', delId);
          if (updErr) console.error("Error updating assignments:", updErr);
      }
      
      // Update tomorrow_vehicles
      const { data: tvs, error: checkTvErr } = await supabase.from('tomorrow_vehicles').select('id').eq('vehicle_id', delId);
      if (checkTvErr) console.error(checkTvErr);
      if (tvs && tvs.length > 0) {
          console.log(`Found ${tvs.length} tomorrow_vehicles. Updating to ${keepVehicleId}...`);
          const { error: updTvErr } = await supabase.from('tomorrow_vehicles').update({ vehicle_id: keepVehicleId }).eq('vehicle_id', delId);
          if (updTvErr) console.error("Error updating tomorrow_vehicles:", updTvErr);
      }
      
      // Update tomorrow_machinery
      const { data: tms, error: checkTmErr } = await supabase.from('tomorrow_machinery').select('id').eq('machinery_id', delId);
      if (checkTmErr) console.error(checkTmErr);
      if (tms && tms.length > 0) {
          console.log(`Found ${tms.length} tomorrow_machinery. Updating to ${keepVehicleId}...`);
          const { error: updTmErr } = await supabase.from('tomorrow_machinery').update({ machinery_id: keepVehicleId }).eq('machinery_id', delId);
          if (updTmErr) console.error("Error updating tomorrow_machinery:", updTmErr);
      }
      
      // Now delete
      console.log(`Deleting ${delId}...`);
      const { error: delErr } = await supabase.from('vehicle_master').delete().eq('id', delId);
      if (delErr) {
          console.error(`Failed to delete ${delId}:`, delErr);
      } else {
          console.log(`Successfully deleted ${delId}`);
      }
  }
  console.log('Done.')
}

fixDuplicates();
