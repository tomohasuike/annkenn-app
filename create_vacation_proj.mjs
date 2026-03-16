import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('projects').insert([{
      project_name: '休暇・不在',
      project_number: 'VAC',
      category: '一般',
      legacy_id: 'vacation',
      status_flag: '着工中'
  }]).select('*').single();
  
  if (error) {
      console.error(error);
  } else {
      console.log("Created vacation project:", data);
  }
}
check();
