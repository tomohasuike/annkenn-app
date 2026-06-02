-- ============================================================
-- 修正: heatstroke_sessions.foreman_id の外部キー制約変更
-- 旧: auth.users(id) 参照 → 誤り（worker_master.idとは別UUID）
-- 新: worker_master(id) 参照 → 正しい
-- 2026-06-03
-- ============================================================

-- 既存のFK制約を削除（auth.users参照）
ALTER TABLE public.heatstroke_sessions 
  DROP CONSTRAINT IF EXISTS heatstroke_sessions_foreman_id_fkey;

-- 正しいFK制約を追加（worker_master参照）
ALTER TABLE public.heatstroke_sessions
  ADD CONSTRAINT heatstroke_sessions_foreman_id_fkey 
  FOREIGN KEY (foreman_id) REFERENCES public.worker_master(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.heatstroke_sessions.foreman_id 
  IS 'まとめ役として担当を宣言した作業員のworker_master.id';
