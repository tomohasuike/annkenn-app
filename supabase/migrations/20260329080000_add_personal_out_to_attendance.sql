-- Add personal outing minutes (私用外出) and memo (備考) if not exists
-- target: public.daily_attendance

ALTER TABLE public.daily_attendance 
ADD COLUMN IF NOT EXISTS personal_out_minutes INTEGER DEFAULT 0;

-- memo should already exist, but just in case
ALTER TABLE public.daily_attendance 
ADD COLUMN IF NOT EXISTS memo TEXT;

-- update comment describing the column
COMMENT ON COLUMN public.daily_attendance.personal_out_minutes IS '私用での外出・中抜け時間（分）';
COMMENT ON COLUMN public.daily_attendance.memo IS '備考・コメント・連絡事項';
