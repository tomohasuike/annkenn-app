-- 1) 古いテーブルを削除する
DROP TABLE IF EXISTS public.completion_reports CASCADE;
DROP TABLE IF EXISTS public.completion_report_photos CASCADE;

-- 2) 新しい構成のテーブルを作成する
CREATE TABLE IF NOT EXISTS public.completion_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    report_id TEXT NOT NULL,
    reporter TEXT,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    completion_date DATE,
    inspection_datetime TIMESTAMP WITH TIME ZONE,
    inspector TEXT,
    witness TEXT,
    inspection_items TEXT[],
    inspection_details TEXT,
    inspection_result TEXT CHECK (inspection_result IN ('合格', '不合格')),
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3) 写真用テーブルの作成
CREATE TABLE IF NOT EXISTS public.completion_report_photos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    completion_report_id UUID REFERENCES public.completion_reports(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    is_main BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS とポリシーの設定
ALTER TABLE public.completion_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completion_report_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users on completion_reports" ON public.completion_reports FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users on completion_reports" ON public.completion_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users on completion_reports" ON public.completion_reports FOR UPDATE USING (true);
CREATE POLICY "Enable delete for authenticated users on completion_reports" ON public.completion_reports FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users on completion_report_photos" ON public.completion_report_photos FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users on completion_report_photos" ON public.completion_report_photos FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users on completion_report_photos" ON public.completion_report_photos FOR UPDATE USING (true);
CREATE POLICY "Enable delete for authenticated users on completion_report_photos" ON public.completion_report_photos FOR DELETE USING (true);
