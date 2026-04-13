-- Catalogs Components (BOM extension phase 4 prep)
CREATE TABLE IF NOT EXISTS catalogs_components (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category TEXT NOT NULL,
    manufacturer TEXT NOT NULL,
    model_number TEXT,
    spec_identifier TEXT,
    width_mm INTEGER,
    height_mm INTEGER,
    depth_mm INTEGER,
    is_din_rail_mountable BOOLEAN DEFAULT false,
    list_price INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calc Projects
CREATE TABLE IF NOT EXISTS calc_projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    rules_version TEXT NOT NULL DEFAULT 'v2026',
    contract_type_result TEXT, -- 'low_voltage', 'high_voltage'
    calculated_total_kw NUMERIC,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calc Panels
CREATE TABLE IF NOT EXISTS calc_panels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calc_project_id UUID REFERENCES calc_projects(id) ON DELETE CASCADE NOT NULL,
    parent_panel_id UUID REFERENCES calc_panels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_existing BOOLEAN DEFAULT false,
    voltage_system TEXT, -- '1φ3W 100/200V', '3φ3W 200V'
    demand_factor_percent INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calc Loads
CREATE TABLE IF NOT EXISTS calc_loads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calc_panel_id UUID REFERENCES calc_panels(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    equipment_type TEXT NOT NULL, -- 'motor', 'heater', 'lighting', 'outlet', etc.
    capacity_kw NUMERIC NOT NULL,
    is_existing BOOLEAN DEFAULT false,
    interlock_group_id TEXT, -- Simple text or UUID for grouping
    operation_mode TEXT DEFAULT 'simultaneous', -- 'simultaneous', 'alternating'
    starting_method TEXT, -- 'direct', 'star_delta', 'inverter'
    distance_m NUMERIC,
    
    calculated_breaker_size TEXT,
    override_breaker_size TEXT,
    calculated_cable_size TEXT,
    calculated_conduit_size TEXT,
    calculated_earth_size TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Panel Components (BOM extension phase 4 prep)
CREATE TABLE IF NOT EXISTS panel_components (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calc_panel_id UUID REFERENCES calc_panels(id) ON DELETE CASCADE NOT NULL,
    component_id UUID REFERENCES catalogs_components(id) ON DELETE SET NULL,
    quantity INTEGER DEFAULT 1,
    original_drawing_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE catalogs_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_panels ENABLE ROW LEVEL SECURITY;
ALTER TABLE calc_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_components ENABLE ROW LEVEL SECURITY;

-- Policies (Simplified for prototype, assuming authenticated users have full access to their data in a real app)
CREATE POLICY "Enable read for authenticated users" ON catalogs_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated users" ON calc_projects FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated users" ON calc_panels FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated users" ON calc_loads FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all for authenticated users" ON panel_components FOR ALL TO authenticated USING (true);
