-- 1. 作業員マスターに「タッチオンタイム社員番号」カラムを追加
ALTER TABLE public.worker_master 
ADD COLUMN IF NOT EXISTS employee_code_tot TEXT;

-- 2. 毎日の勤怠・手当を保存するテーブルを作成
CREATE TABLE IF NOT EXISTS public.daily_attendance (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    worker_id UUID REFERENCES public.worker_master(id) ON DELETE CASCADE NOT NULL,
    target_date DATE NOT NULL,
    clock_in_time TIMESTAMP WITH TIME ZONE,
    clock_out_time TIMESTAMP WITH TIME ZONE,
    role TEXT CHECK (role IN ('職長', '現場代理人', '一般')),
    prep_time_minutes INTEGER DEFAULT 0,
    travel_time_minutes INTEGER DEFAULT 0,
    tot_clock_in_time TIMESTAMP WITH TIME ZONE,
    tot_clock_out_time TIMESTAMP WITH TIME ZONE,
    is_locked BOOLEAN DEFAULT false,
    memo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- 1人の作業員につき、同じ日には1つのレコードしか作れないようにする制約
    UNIQUE(worker_id, target_date)
);

-- RLS（セキュリティポリシー）の有効化
ALTER TABLE public.daily_attendance ENABLE ROW LEVEL SECURITY;

-- 全てのログイン済みユーザーが読み書きできるようにする（簡易設定）
CREATE POLICY "Enable Read access for authenticated users" 
ON public.daily_attendance FOR SELECT 
TO authenticated USING (true);

CREATE POLICY "Enable Insert access for authenticated users" 
ON public.daily_attendance FOR INSERT 
TO authenticated WITH CHECK (true);

CREATE POLICY "Enable Update access for authenticated users" 
ON public.daily_attendance FOR UPDATE 
TO authenticated USING (true);

CREATE POLICY "Enable Delete access for authenticated users" 
ON public.daily_attendance FOR DELETE 
TO authenticated USING (true);
