-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('daily_report_photos', 'daily_report_photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Create policies for the bucket
-- Allow public read access
CREATE POLICY "Daily Report Photos Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'daily_report_photos' );

-- Allow all uploads (both anon and authenticated)
CREATE POLICY "Daily Report Photos Allow All Uploads"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'daily_report_photos' );

-- Allow all updates
CREATE POLICY "Daily Report Photos Allow All Updates"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'daily_report_photos' );

-- Allow all deletes
CREATE POLICY "Daily Report Photos Allow All Deletes"
ON storage.objects FOR DELETE
USING ( bucket_id = 'daily_report_photos' );
