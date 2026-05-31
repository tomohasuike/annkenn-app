-- heatstroke_sessions table
CREATE TABLE IF NOT EXISTS public.heatstroke_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    target_date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_time_type TEXT NOT NULL,
    temperature NUMERIC(4,1) NOT NULL DEFAULT 25.0,
    humidity NUMERIC(4,1) NOT NULL DEFAULT 60.0,
    weather TEXT NOT NULL DEFAULT 'sunny',
    wbgt NUMERIC(3,1) NOT NULL DEFAULT 25.0,
    risk_level TEXT NOT NULL DEFAULT 'caution',
    environment_type TEXT NOT NULL DEFAULT 'outdoor_shade',
    temp_offset NUMERIC(2,1) NOT NULL DEFAULT 0.0,
    wbgt_actual NUMERIC(3,1),
    gps_latitude NUMERIC(9,6),
    gps_longitude NUMERIC(9,6),
    gps_captured_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.worker_master(id) ON DELETE SET NULL,
    confirmed_by UUID REFERENCES public.worker_master(id) ON DELETE SET NULL,
    confirmed_at TIMESTAMPTZ,
    foreman_confirmation JSONB DEFAULT '{}'::jsonb,
    safety_checks JSONB,
    overall_comment TEXT,
    photo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_heatstroke_session UNIQUE NULLS NOT DISTINCT (project_id, target_date, check_time_type)
);

-- heatstroke_worker_checks table
CREATE TABLE IF NOT EXISTS public.heatstroke_worker_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.heatstroke_sessions(id) ON DELETE CASCADE,
    worker_id UUID NOT NULL REFERENCES public.worker_master(id) ON DELETE CASCADE,
    worker_name TEXT NOT NULL,
    sleep_hours INTEGER NOT NULL DEFAULT 0,
    breakfast BOOLEAN,
    hangover BOOLEAN,
    symptoms TEXT NOT NULL DEFAULT 'none',
    risk_score TEXT NOT NULL DEFAULT 'low',
    water_checked BOOLEAN NOT NULL DEFAULT false,
    urine_checked BOOLEAN NOT NULL DEFAULT false,
    comment TEXT,
    submitted_by TEXT NOT NULL DEFAULT 'self',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_worker_per_session UNIQUE (session_id, worker_id)
);

-- RLS for heatstroke_sessions
ALTER TABLE public.heatstroke_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='heatstroke_sessions' AND policyname='sessions_select') THEN
    CREATE POLICY sessions_select ON public.heatstroke_sessions FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='heatstroke_sessions' AND policyname='sessions_insert') THEN
    CREATE POLICY sessions_insert ON public.heatstroke_sessions FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='heatstroke_sessions' AND policyname='sessions_update') THEN
    CREATE POLICY sessions_update ON public.heatstroke_sessions FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='heatstroke_sessions' AND policyname='sessions_delete') THEN
    CREATE POLICY sessions_delete ON public.heatstroke_sessions FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- RLS for heatstroke_worker_checks
ALTER TABLE public.heatstroke_worker_checks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='heatstroke_worker_checks' AND policyname='worker_checks_select') THEN
    CREATE POLICY worker_checks_select ON public.heatstroke_worker_checks FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='heatstroke_worker_checks' AND policyname='worker_checks_insert') THEN
    CREATE POLICY worker_checks_insert ON public.heatstroke_worker_checks FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='heatstroke_worker_checks' AND policyname='worker_checks_update') THEN
    CREATE POLICY worker_checks_update ON public.heatstroke_worker_checks FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='heatstroke_worker_checks' AND policyname='worker_checks_delete') THEN
    CREATE POLICY worker_checks_delete ON public.heatstroke_worker_checks FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- ============================================================
-- まとめ役決定機能：foreman_id カラム追加
-- 2026-06-01
-- ============================================================
ALTER TABLE public.heatstroke_sessions
  ADD COLUMN IF NOT EXISTS foreman_id UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.heatstroke_sessions.foreman_id IS 'まとめ役として担当を宣言したユーザーのID';
