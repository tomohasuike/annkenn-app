-- 現場用ツール（電灯計算書・動力計算書など）のデータを保存するテーブル
CREATE TABLE IF NOT EXISTS public.site_tools_data (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    tool_type TEXT NOT NULL, -- 'LIGHTING_CALC', 'POWER_CALC' など
    name TEXT NOT NULL,      -- 計算書のタイトル（例：A棟1階 電灯分電盤負荷表）
    data_payload JSONB DEFAULT '{}'::jsonb NOT NULL, -- 複雑な入力データや計算結果を丸ごと保存
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS（セキュリティポリシー）の有効化
ALTER TABLE public.site_tools_data ENABLE ROW LEVEL SECURITY;

-- 全てのログイン済みユーザーが読み書きできるようにする（プロジェクトごとのアクセス権はアプリケーション側で制御する前提）
CREATE POLICY "Enable Read access for authenticated users" 
ON public.site_tools_data FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Enable Insert access for authenticated users" 
ON public.site_tools_data FOR INSERT 
TO authenticated WITH CHECK (true);

CREATE POLICY "Enable Update access for authenticated users" 
ON public.site_tools_data FOR UPDATE 
TO authenticated USING (true);

CREATE POLICY "Enable Delete access for authenticated users" 
ON public.site_tools_data FOR DELETE 
TO authenticated USING (true);
