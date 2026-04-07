import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function initManufacturers() {
  const sql = `
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM manufacturers WHERE name = '未来工業') THEN
            INSERT INTO manufacturers (name) VALUES ('未来工業'), ('パナソニック'), ('IDEC'), ('ネグロス電工'), ('春日電機'), ('古河電気工業');
        END IF;
    END
    $$;
  `;
  const { error } = await supabase.rpc('exec_raw_sql', { query: sql });
  if (error) console.error(`Error inserting manufacturers via RPC:`, error);
  else console.log(`Successfully inserted manufacturers!`);
}

initManufacturers();
