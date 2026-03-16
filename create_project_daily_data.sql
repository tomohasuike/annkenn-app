-- 自動生成: プロジェクトの日次データ（予定人員・コメント）を保存するテーブルを作成
CREATE TABLE IF NOT EXISTS public.project_daily_data (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  target_date date NOT NULL,
  planned_count integer,
  comment text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(project_id, target_date)
);

-- RLS設定 (現在の要件に合わせて全許可)
ALTER TABLE public.project_daily_data ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_catalog.pg_policies WHERE tablename = 'project_daily_data' AND policyname = 'Enable read access for all users'
    ) THEN
        CREATE POLICY "Enable read access for all users" ON public.project_daily_data FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (
        SELECT FROM pg_catalog.pg_policies WHERE tablename = 'project_daily_data' AND policyname = 'Enable insert for all users'
    ) THEN
        CREATE POLICY "Enable insert for all users" ON public.project_daily_data FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (
        SELECT FROM pg_catalog.pg_policies WHERE tablename = 'project_daily_data' AND policyname = 'Enable update for all users'
    ) THEN
        CREATE POLICY "Enable update for all users" ON public.project_daily_data FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (
        SELECT FROM pg_catalog.pg_policies WHERE tablename = 'project_daily_data' AND policyname = 'Enable delete for all users'
    ) THEN
        CREATE POLICY "Enable delete for all users" ON public.project_daily_data FOR DELETE USING (true);
    END IF;
END $$;
