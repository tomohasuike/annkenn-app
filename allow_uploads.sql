CREATE POLICY "Allow anon insert temporarily" 
ON storage.objects FOR INSERT 
TO public 
WITH CHECK ( bucket_id = 'daily_report_photos' );
