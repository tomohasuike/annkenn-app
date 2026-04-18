import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: reports } = await supabase.from('safety_reports')
    .select('worker_id, worker_master(name), created_at')
    .gte('created_at', '2026-04-01T00:00:00Z')
    .order('created_at', {ascending: false});
  console.log("April Reports:", reports?.length);
  console.table(reports?.map(r => ({ worker: r.worker_master?.name, time: r.created_at })) || []);
}
check();
