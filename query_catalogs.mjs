import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('materials').select('*, manufacturers(name)');
  if (error) { console.error(error); return; }
  
  const stats = {};
  data.forEach(m => {
    const maker = m.manufacturers?.name || 'その他/不明';
    if (!stats[maker]) stats[maker] = 0;
    stats[maker]++;
  });
  
  for (const [maker, count] of Object.entries(stats)) {
    console.log(`- ${maker}: ${count}件`);
  }
}
run();
