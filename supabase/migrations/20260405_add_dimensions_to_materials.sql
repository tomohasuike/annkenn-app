-- カタログの寸法データ（収まり検討用）を格納するカラムを追加
ALTER TABLE materials
ADD COLUMN IF NOT EXISTS width_mm numeric,
ADD COLUMN IF NOT EXISTS height_mm numeric,
ADD COLUMN IF NOT EXISTS depth_mm numeric;
