import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('daily_reports').select('*').limit(1);
  console.log("daily_reports:", data, error?.message);

  const { data: d2, error: e2 } = await supabase.from('project_comments').select('*').limit(1);
  console.log("project_comments:", d2, e2?.message);
}
check()
