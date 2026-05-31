-- 20260529143000_create_heatstroke_checks.sql
CREATE TABLE IF NOT EXISTS public.heatstroke_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    target_date DATE NOT NULL DEFAULT CURRENT_DATE, -- チェック対象日
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- チェック実行日時
    foreman_id UUID REFERENCES public.worker_master(id) ON DELETE SET NULL, -- 本日の作業指揮者（職長）
    check_time_type TEXT NOT NULL, -- '朝', '10時休憩', '15時休憩'
    temperature NUMERIC(4, 1) NOT NULL, -- 気温
    humidity NUMERIC(4, 1) NOT NULL, -- 湿度
    weather TEXT NOT NULL, -- '晴れ', '曇り', '雨', '屋内'
    wbgt NUMERIC(3, 1) NOT NULL, -- 算出暑さ指数 (WBGT)
    risk_level TEXT NOT NULL, -- 'ほぼ安全', '注意', '警戒', '厳重警戒', '危険'
    environment_type TEXT NOT NULL DEFAULT '屋外（日陰）', -- '屋外（直射日光）', '屋外（日陰）', '屋内（空調なし）', '屋内（空調あり）'
    temp_offset NUMERIC(2,1) NOT NULL DEFAULT 0.0, -- 温度微調整用 (+1.0, +2.0, -1.0 等)
    -- 参加作業員全員のチェック状況をJSONBで保存
    -- 形式: [{ "worker_id": "UUID", "worker_name": "氏名", "sleep_hours": 6, "breakfast": true, "hangover": false, "symptoms": "なし", "risk_score": "低", "water_checked": true, "urine_checked": true }]
    worker_checks JSONB NOT NULL DEFAULT '[]'::jsonb, 
    photo_url TEXT, -- Google Drive上の証跡写真URL
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- 重複登録を防ぐユニーク制約（1つの現場につき、1日・各時間帯1回のみ登録）
    CONSTRAINT unique_project_date_time_check UNIQUE (project_id, target_date, check_time_type)
);

-- RLS（行セキュリティ）の有効化と簡易ポリシー設定
ALTER TABLE public.heatstroke_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read for all authenticated users" ON public.heatstroke_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for all authenticated users" ON public.heatstroke_checks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for all authenticated users" ON public.heatstroke_checks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete for all authenticated users" ON public.heatstroke_checks FOR DELETE TO authenticated USING (true);
