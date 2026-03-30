-- 事務局用メモを追加
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS admin_memo TEXT;
