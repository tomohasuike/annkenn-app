-- Migration to allow unassigned site tools data and track creator

-- Drop NOT NULL constraint on project_id
ALTER TABLE public.site_tools_data ALTER COLUMN project_id DROP NOT NULL;

-- Add created_by_name to track who created the calculation
ALTER TABLE public.site_tools_data ADD COLUMN IF NOT EXISTS created_by_name TEXT;
