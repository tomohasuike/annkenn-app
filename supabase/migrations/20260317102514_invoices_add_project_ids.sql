-- Add project_ids array columnd to invoices table
ALTER TABLE public.invoices ADD COLUMN project_ids uuid[] DEFAULT '{}'::uuid[];

-- Migrate existing data: copy the current project_id into the new project_ids array
UPDATE public.invoices SET project_ids = ARRAY[project_id] WHERE project_id IS NOT NULL;
