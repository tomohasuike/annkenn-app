-- Add start_time and end_time to assignments table
ALTER TABLE public.assignments
ADD COLUMN start_time time without time zone,
ADD COLUMN end_time time without time zone;
