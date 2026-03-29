-- Add site_declarations to daily_attendance
-- This column will store an array of JSON objects representing the worker's self-declared site entry/exit times.
-- Example: [{"project_name": "Site A", "project_id": "uuid", "start_time": "09:00", "end_time": "15:00"}]

ALTER TABLE public.daily_attendance
ADD COLUMN IF NOT EXISTS site_declarations JSONB DEFAULT '[]'::jsonb;
