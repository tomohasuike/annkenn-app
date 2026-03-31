CREATE TABLE IF NOT EXISTS project_role_assignments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES worker_master(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('現場代理人', '現場代理人（主任技術者）', '監理技術者')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Protect against end_date < start_date
ALTER TABLE project_role_assignments ADD CONSTRAINT valid_date_range CHECK (end_date >= start_date);

-- Enable RLS
ALTER TABLE project_role_assignments ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read and insert/update
CREATE POLICY "Enable read access for all authenticated users" ON project_role_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON project_role_assignments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Enable update for authenticated users" ON project_role_assignments FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable delete for authenticated users" ON project_role_assignments FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Create a trigger to update 'updated_at'
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_project_role_assignments_updated_at BEFORE UPDATE
    ON project_role_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
