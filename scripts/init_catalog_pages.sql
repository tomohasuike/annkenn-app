CREATE TABLE IF NOT EXISTS catalog_pages (
  id uuid primary key default gen_random_uuid(),
  manufacturer text NOT NULL,
  catalog_name text NOT NULL,
  page_number int NOT NULL,
  drive_file_id text NOT NULL,
  created_at timestamptz default now(),
  UNIQUE(manufacturer, catalog_name, page_number)
);

ALTER TABLE catalog_pages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'catalog_pages' AND policyname = 'Enable public read on catalog_pages'
    ) THEN
        CREATE POLICY "Enable public read on catalog_pages" ON catalog_pages FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'catalog_pages' AND policyname = 'Enable public all on catalog_pages'
    ) THEN
        CREATE POLICY "Enable public all on catalog_pages" ON catalog_pages FOR ALL USING (true);
    END IF;
END
$$;
