import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);
const query = `
CREATE TABLE IF NOT EXISTS catalog_pages (
  id uuid primary key default gen_random_uuid(),
  manufacturer text NOT NULL,
  catalog_name text NOT NULL,
  page_number int NOT NULL,
  drive_file_id text NOT NULL,
  created_at timestamptz default now(),
  UNIQUE(manufacturer, catalog_name, page_number)
);

ALTER TABLE catalog_pages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'catalog_pages' AND policyname = 'Enable public read on catalog_pages'
    ) THEN
        CREATE POLICY "Enable public read on catalog_pages" ON catalog_pages FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'catalog_pages' AND policyname = 'Enable public all on catalog_pages'
    ) THEN
        CREATE POLICY "Enable public all on catalog_pages" ON catalog_pages FOR ALL USING (true);
    END IF;
END
$$;
`;
async function run() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: query });
  if (error) {
    if (error.message.includes('execute_sql')) {
        // execute_sql migh not exist, use postgres REST directly if needed, or we just rely on psql if we had it.
        // Let's create an edge function or use DDL in supabase dashboard... Wait, does supabase-js allow DDL without RPC? No.
        // I will just use postgres connection string if available, or ask user to run it?
        console.log("Cannot run DDL from supabase client without RPC. Please run manually or I will skip if table exists.");
    } else {
        console.log(error);
    }
  } else {
    console.log("Success");
  }
}
run();
