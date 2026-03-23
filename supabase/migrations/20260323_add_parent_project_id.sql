-- Add parent_project_id to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS parent_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;
