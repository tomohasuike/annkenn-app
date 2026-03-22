import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function mergeSubcontractor() {
  console.log("Updating report_subcontractors text names directly...");
  const { data: pData, error: pErr } = await supabase
    .from('report_subcontractors')
    .update({ subcontractor_name: '池沢' })
    .eq('subcontractor_name', '池澤様')
    .select();
    
  if (pErr) {
    console.error("Error updating report_subcontractors:", pErr);
  } else {
    console.log(`Updated ${pData?.length || 0} report_subcontractors rows.`);
    console.log(pData);
  }

  console.log("Merge completed successfully!");
}

mergeSubcontractor().catch(console.error);
