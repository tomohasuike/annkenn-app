import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '.env');
const envStr = fs.readFileSync(envPath, 'utf-8');

let supabaseUrl = '';
let supabaseKey = '';

for (const line of envStr.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) {
    supabaseUrl = line.split('=')[1].trim();
  } else if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) {
    supabaseKey = line.split('=')[1].trim();
  }
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL() {
    const sql = `
CREATE TABLE IF NOT EXISTS project_role_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES worker_master(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('現場代理人', '現場代理人（主任技術者）', '監理技術者')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

ALTER TABLE project_role_assignments ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable read access for all authenticated users' AND tablename = 'project_role_assignments') THEN
      CREATE POLICY "Enable read access for all authenticated users" ON project_role_assignments FOR SELECT TO authenticated USING (true);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable insert for authenticated users' AND tablename = 'project_role_assignments') THEN
      CREATE POLICY "Enable insert for authenticated users" ON project_role_assignments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable update for authenticated users' AND tablename = 'project_role_assignments') THEN
      CREATE POLICY "Enable update for authenticated users" ON project_role_assignments FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable delete for authenticated users' AND tablename = 'project_role_assignments') THEN
      CREATE POLICY "Enable delete for authenticated users" ON project_role_assignments FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $func$ 
        BEGIN 
           NEW.updated_at = NOW(); 
           RETURN NEW; 
        END; 
        $func$ language 'plpgsql';
    END IF;
END $$;

DROP TRIGGER IF EXISTS update_project_role_assignments_updated_at ON project_role_assignments;
CREATE TRIGGER update_project_role_assignments_updated_at BEFORE UPDATE
    ON project_role_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `;
    
    // Use an RPC call to execute SQL, or we can use the postgres tool if available.
    // Wait, let's use the MCP supabase plugin instead since we can't run DDL via client JS unless using a service key and rpc.
    console.log("SQL TO RUN:", sql);
}

runSQL().catch(console.error);
