-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('completion_report_photos', 'completion_report_photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Create policies for the bucket
-- Allow public read access
CREATE POLICY "Completion Report Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'completion_report_photos' );

-- Allow all uploads (temporarily for data migration)
CREATE POLICY "Completion Report Allow All Uploads"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'completion_report_photos' );

-- Allow all updates
CREATE POLICY "Completion Report Allow All Updates"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'completion_report_photos' );

-- Allow all deletes
CREATE POLICY "Completion Report Allow All Deletes"
ON storage.objects FOR DELETE
USING ( bucket_id = 'completion_report_photos' );
