import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

let envPath = '.env.local';
if (!fs.existsSync(envPath)) envPath = '.env';
dotenv.config({ path: envPath });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('projects').select('*').in('project_number', ['260314', '250712']);
  console.log(JSON.stringify(data, null, 2));
}
run();
