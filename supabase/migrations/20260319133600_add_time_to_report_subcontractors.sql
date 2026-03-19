-- Add start_time and end_time to report_subcontractors table to support custom individual times

ALTER TABLE "public"."report_subcontractors" 
ADD COLUMN "start_time" time without time zone,
ADD COLUMN "end_time" time without time zone;
