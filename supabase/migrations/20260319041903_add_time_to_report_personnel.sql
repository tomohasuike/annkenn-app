-- Migration to add individual start and end times to daily report personnel

ALTER TABLE "public"."report_personnel" 
ADD COLUMN "start_time" time without time zone,
ADD COLUMN "end_time" time without time zone;
