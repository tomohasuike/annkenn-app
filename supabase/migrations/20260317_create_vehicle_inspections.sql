-- 車両点検記録テーブルの作成
CREATE TABLE IF NOT EXISTS public.vehicle_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES public.vehicle_master(id) ON DELETE CASCADE,
    inspector_id UUID REFERENCES public.worker_master(id) ON DELETE SET NULL,
    inspection_date DATE NOT NULL,
    current_mileage INTEGER,
    last_oil_change_mileage INTEGER,
    inspection_details JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 車両点検写真テーブルの作成
CREATE TABLE IF NOT EXISTS public.vehicle_inspection_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID REFERENCES public.vehicle_inspections(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックスの作成
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_vehicle_id ON public.vehicle_inspections(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_inspector_id ON public.vehicle_inspections(inspector_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspection_photos_inspection_id ON public.vehicle_inspection_photos(inspection_id);

-- Storage バケットの作成（もし存在しない場合）
INSERT INTO storage.buckets (id, name, public) 
VALUES ('vehicle_inspections', 'vehicle_inspections', true)
ON CONFLICT (id) DO NOTHING;

-- Storage の RLS ポリシー作成
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'vehicle_inspections');

CREATE POLICY "Auth Upload" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'vehicle_inspections' AND auth.role() = 'authenticated');

CREATE POLICY "Auth Update" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'vehicle_inspections' AND auth.role() = 'authenticated');

CREATE POLICY "Auth Delete" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'vehicle_inspections' AND auth.role() = 'authenticated');

-- テーブルの RLS を有効化
ALTER TABLE public.vehicle_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_inspection_photos ENABLE ROW LEVEL SECURITY;

-- テーブルの RLS ポリシー設定 (認証済みユーザーにフルアクセスを許可)
CREATE POLICY "Allow authenticated full access to vehicle_inspections" 
    ON public.vehicle_inspections 
    AS PERMISSIVE FOR ALL 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Allow authenticated full access to vehicle_inspection_photos" 
    ON public.vehicle_inspection_photos 
    AS PERMISSIVE FOR ALL 
    TO authenticated 
    USING (true) 
    WITH CHECK (true);
