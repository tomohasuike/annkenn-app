CREATE TABLE IF NOT EXISTS tomorrow_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID REFERENCES tomorrow_schedules(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES vehicle_master(id) ON DELETE SET NULL,
    vehicle_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS tomorrow_machinery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID REFERENCES tomorrow_schedules(id) ON DELETE CASCADE,
    machinery_id UUID REFERENCES vehicle_master(id) ON DELETE SET NULL,
    machinery_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

ALTER TABLE tomorrow_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tomorrow_machinery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all actions for all users" ON tomorrow_vehicles FOR ALL USING (true);
CREATE POLICY "Enable all actions for all users" ON tomorrow_machinery FOR ALL USING (true);
