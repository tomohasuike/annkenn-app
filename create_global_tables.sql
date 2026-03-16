-- 自動生成: 全体共有メモとTODOを保存するテーブルを作成
CREATE TABLE IF NOT EXISTS public.global_memos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content text DEFAULT '',
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.todos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  text text NOT NULL,
  completed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 初期データの投入（メモ用）
INSERT INTO public.global_memos (content) 
SELECT '' 
WHERE NOT EXISTS (SELECT 1 FROM public.global_memos);

-- RLS設定 (現在の要件に合わせて全許可)
ALTER TABLE public.global_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- global_memos policies
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_policies WHERE tablename = 'global_memos' AND policyname = 'Enable read access for all users') THEN
        CREATE POLICY "Enable read access for all users" ON public.global_memos FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_policies WHERE tablename = 'global_memos' AND policyname = 'Enable insert for all users') THEN
        CREATE POLICY "Enable insert for all users" ON public.global_memos FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_policies WHERE tablename = 'global_memos' AND policyname = 'Enable update for all users') THEN
        CREATE POLICY "Enable update for all users" ON public.global_memos FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_policies WHERE tablename = 'global_memos' AND policyname = 'Enable delete for all users') THEN
        CREATE POLICY "Enable delete for all users" ON public.global_memos FOR DELETE USING (true);
    END IF;

    -- todos policies
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_policies WHERE tablename = 'todos' AND policyname = 'Enable read access for all users') THEN
        CREATE POLICY "Enable read access for all users" ON public.todos FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_policies WHERE tablename = 'todos' AND policyname = 'Enable insert for all users') THEN
        CREATE POLICY "Enable insert for all users" ON public.todos FOR INSERT WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_policies WHERE tablename = 'todos' AND policyname = 'Enable update for all users') THEN
        CREATE POLICY "Enable update for all users" ON public.todos FOR UPDATE USING (true);
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_policies WHERE tablename = 'todos' AND policyname = 'Enable delete for all users') THEN
        CREATE POLICY "Enable delete for all users" ON public.todos FOR DELETE USING (true);
    END IF;
END $$;
