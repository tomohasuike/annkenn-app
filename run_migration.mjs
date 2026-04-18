import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { error } = await supabase.rpc('execute_sql', {
    sql: 'ALTER TABLE calc_panels ADD COLUMN IF NOT EXISTS tree_node_id TEXT;'
  });
  
  if (error) {
    if (error.message.includes("could not find the function")) {
        // If rpc not available, let's try a direct insert error test?
        console.log("RPC blocked.", error);
    } else {
        console.error("Error:", error);
    }
  } else {
    console.log("Migration successful!");
  }
}

run();
