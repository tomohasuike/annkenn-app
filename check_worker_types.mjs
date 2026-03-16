import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('worker_master').select('type').limit(100);
  if (error) {
    console.error(error);
  } else {
    const types = new Set(data.map(d => d.type));
    console.log("Types present:", Array.from(types));
    
    // Let's also check if any are 'president' or 'partner'
    const { data: partners } = await supabase.from('worker_master').select('name, type').eq('type', 'partner').limit(5);
    console.log("Partners:", partners);
    
    // And see the default fallback types added
    const { data: general } = await supabase.from('worker_master').select('name, type').limit(5);
    console.log("Sample workers:", general);
  }
}
check();
