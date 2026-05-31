-- =============================================================================
-- 20260530160000_redesign_heatstroke_self_report.sql
-- 熱中症安否確認システム v2.0
-- 「職長一括入力」→「自己申告 + まとめ役確認」モデルへ再設計
-- 旧テーブル heatstroke_checks は既存データ保護のため残す（削除しない）
-- =============================================================================

-- =============================================================================
-- テーブル①: heatstroke_sessions（現場セッション）
-- 現場の天気・WBGT・GPS・まとめ役確認情報を管理。
-- 1現場 × 1日 × 1時間帯で1行のみ。
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.heatstroke_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 現場（null = 現場なし・アサインなし）
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,

    target_date DATE NOT NULL DEFAULT CURRENT_DATE,           -- チェック対象日
    check_time_type TEXT NOT NULL,                            -- '朝', '10時休憩', '15時休憩'

    -- 気象・環境データ（現場共通・まとめ役または最初の人が設定）
    temperature      NUMERIC(4,1) NOT NULL DEFAULT 25.0,      -- 基準気温（℃）
    humidity         NUMERIC(4,1) NOT NULL DEFAULT 60.0,      -- 湿度（%）
    weather          TEXT NOT NULL DEFAULT '晴れ',             -- '晴れ', '曇り', '雨', '屋内'
    wbgt             NUMERIC(3,1) NOT NULL DEFAULT 25.0,      -- 暑さ指数（WBGT）
    risk_level       TEXT NOT NULL DEFAULT '注意',             -- 'ほぼ安全', '注意', '警戒', '厳重警戒', '危険'
    environment_type TEXT NOT NULL DEFAULT '屋外（日陰）',     -- '屋外（直射日光）', '屋外（日陰）', '屋内（空調なし）', '屋内（空調あり）'
    temp_offset      NUMERIC(2,1) NOT NULL DEFAULT 0.0,       -- 体感温度微調整値

    -- 現地実測値（手入力優先時のみ格納）
    wbgt_actual NUMERIC(3,1),                                 -- 現地WBGT測定器の実測値

    -- GPS情報（取得できた場合のみ）
    gps_latitude     NUMERIC(9,6),                            -- 緯度
    gps_longitude    NUMERIC(9,6),                            -- 経度
    gps_captured_at  TIMESTAMPTZ,                             -- GPS取得日時

    -- セッション作成者（気象を最初にセットした人 = まとめ役候補）
    created_by UUID REFERENCES public.worker_master(id) ON DELETE SET NULL,

    -- まとめ役による最終確認情報
    confirmed_by UUID REFERENCES public.worker_master(id) ON DELETE SET NULL, -- 確認した人（まとめ役）
    confirmed_at TIMESTAMPTZ,                                  -- 確認完了タイムスタンプ
    -- まとめ役3項目確認チェック
    -- { "visual_check": true, "risk_followup": true, "work_decision": true }
    foreman_confirmation JSONB DEFAULT '{}'::jsonb,

    -- WBGT危険領域（28℃以上）における安全管理指針5項目
    -- { "rest_time": true, "hydration": true, "shade": true, "buddy_system": true, "clothing": true }
    safety_checks JSONB,

    overall_comment TEXT,  -- 現場全体の特記事項・指示事項
    photo_url TEXT,         -- Google Drive上の証跡写真URL

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- 1現場・1日・1時間帯につき1セッション
    -- （project_id が null = 現場なし同士は重複を許容するためNULLS NOT DISTINCTを使用）
    CONSTRAINT unique_heatstroke_session UNIQUE NULLS NOT DISTINCT (project_id, target_date, check_time_type)
);

-- =============================================================================
-- テーブル②: heatstroke_worker_checks（個人別自己申告）
-- 各作業員が自分で入力する体調チェックデータ。1人1行。
-- session_id で heatstroke_sessions と紐づく。
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.heatstroke_worker_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    session_id UUID NOT NULL REFERENCES public.heatstroke_sessions(id) ON DELETE CASCADE,
    worker_id  UUID NOT NULL REFERENCES public.worker_master(id) ON DELETE CASCADE,
    worker_name TEXT NOT NULL, -- 表示用キャッシュ（マスタ変更時の記録保護）

    -- ============ 体調チェック項目（自己申告） ============
    -- sleep_hours: 0=未選択, 1=6時間未満（要注意）, 2=6〜7時間（最低ライン）, 3=8時間以上（推奨）
    sleep_hours   INTEGER NOT NULL DEFAULT 0,
    breakfast     BOOLEAN,                          -- null=未回答, true=食べた, false=食べていない
    hangover      BOOLEAN,                          -- null=未回答, true=あり, false=なし
    symptoms      TEXT NOT NULL DEFAULT 'なし',     -- 自覚症状（'なし', '頭痛', 'めまい', '吐き気', '倦怠感'）
    risk_score    TEXT NOT NULL DEFAULT '低',       -- '低', '中', '高'（自動算出）
    water_checked BOOLEAN NOT NULL DEFAULT false,   -- 水分・塩分補給確認
    urine_checked BOOLEAN NOT NULL DEFAULT false,   -- 尿色確認
    comment       TEXT,                             -- 個別メモ・気になる点

    -- ============ 申告メタデータ ============
    -- submitted_by: 'self'=本人自己申告, 'foreman'=まとめ役による代理入力
    submitted_by TEXT NOT NULL DEFAULT 'self',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- 1セッションにつき1人1回のみ登録（upsert可能）
    CONSTRAINT unique_worker_per_session UNIQUE (session_id, worker_id)
);

-- =============================================================================
-- RLS（行レベルセキュリティ）の有効化とポリシー設定
-- =============================================================================

-- セッションテーブルのRLS
ALTER TABLE public.heatstroke_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証ユーザーはセッションを閲覧可能"
  ON public.heatstroke_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "認証ユーザーはセッションを作成可能"
  ON public.heatstroke_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "認証ユーザーはセッションを更新可能"
  ON public.heatstroke_sessions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "認証ユーザーはセッションを削除可能"
  ON public.heatstroke_sessions FOR DELETE TO authenticated USING (true);

-- 個人チェックテーブルのRLS
ALTER TABLE public.heatstroke_worker_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証ユーザーは全チェックを閲覧可能"
  ON public.heatstroke_worker_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "認証ユーザーはチェックを作成可能"
  ON public.heatstroke_worker_checks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "認証ユーザーはチェックを更新可能"
  ON public.heatstroke_worker_checks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "認証ユーザーはチェックを削除可能"
  ON public.heatstroke_worker_checks FOR DELETE TO authenticated USING (true);
