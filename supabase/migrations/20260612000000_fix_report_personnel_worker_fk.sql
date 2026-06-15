-- report_personnelテーブルのworker_idFK制約を修正
-- 問題: ON DELETE句がなく（NO ACTION）、worker_masterの削除時にエラーが発生していた
-- 修正: ON DELETE SET NULL に変更し、作業員が削除されても日報履歴を保持する

-- 既存のFK制約を削除（制約名はPostgreSQLのデフォルト命名規則）
ALTER TABLE public.report_personnel
  DROP CONSTRAINT IF EXISTS report_personnel_worker_id_fkey;

-- worker_idをNULL許容に変更（SET NULLのために必要）
ALTER TABLE public.report_personnel
  ALTER COLUMN worker_id DROP NOT NULL;

-- ON DELETE SET NULL付きでFK制約を再追加
ALTER TABLE public.report_personnel
  ADD CONSTRAINT report_personnel_worker_id_fkey
  FOREIGN KEY (worker_id)
  REFERENCES public.worker_master(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.report_personnel.worker_id IS '作業員ID（worker_master）。作業員削除時はNULLになるが日報履歴は保持される。';
