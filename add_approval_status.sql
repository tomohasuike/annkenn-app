-- 完了報告テーブルに承認ステータスなどの不足カラムを追加する
ALTER TABLE public.completion_reports 
ADD COLUMN IF NOT EXISTS approval_status TEXT,
ADD COLUMN IF NOT EXISTS approver_comment TEXT;
