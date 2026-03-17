-- Add display_order column to worker_master table for custom sorting
ALTER TABLE public.worker_master 
ADD COLUMN display_order INTEGER DEFAULT 999;

-- Set sequential display_order for existing records based on current ID to maintain some order initially
WITH numbered_workers AS (
  SELECT id, row_number() OVER (ORDER BY id) as rn
  FROM public.worker_master
)
UPDATE public.worker_master wm
SET display_order = nw.rn
FROM numbered_workers nw
WHERE wm.id = nw.id;
