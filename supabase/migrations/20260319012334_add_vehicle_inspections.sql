-- migration file: supabase/migrations/20260319012334_add_vehicle_inspections.sql
ALTER TABLE vehicle_master ADD COLUMN IF NOT EXISTS last_inspected_mileage integer DEFAULT 0;
ALTER TABLE vehicle_master ADD COLUMN IF NOT EXISTS last_oil_change_mileage integer DEFAULT 0;
ALTER TABLE vehicle_master ADD COLUMN IF NOT EXISTS is_inspection_only boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS vehicle_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES vehicle_master(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('点検', 'オイル交換')),
  inspector_id uuid REFERENCES worker_master(id) ON DELETE SET NULL,
  current_mileage integer NOT NULL DEFAULT 0,
  oil_status text,
  coolant_status text,
  washer_status text,
  wiper_status text,
  brake_status text,
  tire_status text,
  underbody_status text,
  lights_status text,
  notes text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS and add basic policies
ALTER TABLE vehicle_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON vehicle_inspections FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON vehicle_inspections FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON vehicle_inspections FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON vehicle_inspections FOR DELETE USING (true);

-- Insert ジムニー as an inspection-only vehicle if it doesn't already exist
INSERT INTO vehicle_master (id, vehicle_name, is_inspection_only)
SELECT gen_random_uuid(), 'ジムニー', true
WHERE NOT EXISTS (
    SELECT 1 FROM vehicle_master WHERE vehicle_name = 'ジムニー'
);
