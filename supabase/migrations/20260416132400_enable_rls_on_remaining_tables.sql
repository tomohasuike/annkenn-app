-- RLS有効化 + 認証済みユーザーポリシー追加
-- Supabaseセキュリティアラート対応 (2026-04-16)
-- アプリの既存動作を維持しつつ、未認証ユーザーからのアクセスを遮断

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can access app_settings"
  ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.calc_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can access calc_projects"
  ON public.calc_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.manufacturers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can access manufacturers"
  ON public.manufacturers FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can access materials"
  ON public.materials FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.safety_notification_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can access safety_notification_history"
  ON public.safety_notification_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.safety_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can access safety_reports"
  ON public.safety_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);
