import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

let envPath = '.env.local';
if (!fs.existsSync(envPath)) envPath = '.env';
dotenv.config({ path: envPath });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('projects').select('project_number').not('project_number', 'is', null);
  const distinct = [...new Set(data.map(d => d.project_number))];
  console.log("Distinct Nos:", distinct.slice(0, 20)); // show first 20
}
run();
