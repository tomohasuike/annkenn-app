import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: workerData, error: workerErr } = await supabase
    .from('worker_master')
    .select('*')
    .like('name', '%作業車%');

  console.log("Found in worker_master:", workerData);

  const { data: vehicleData, error: vehicleErr } = await supabase
    .from('vehicle_master')
    .select('*')
    .like('vehicle_name', '%作業車%');

  console.log("Found in vehicle_master:", vehicleData);
}

main();
