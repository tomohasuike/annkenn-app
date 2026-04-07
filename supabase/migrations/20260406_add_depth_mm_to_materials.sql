-- Add dimensions columns if they don't exist
ALTER TABLE materials 
ADD COLUMN IF NOT EXISTS width_mm numeric,
ADD COLUMN IF NOT EXISTS height_mm numeric,
ADD COLUMN IF NOT EXISTS depth_mm numeric;
