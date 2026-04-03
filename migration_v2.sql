-- ===========================================
-- Prompt Group Versioning Migration
-- ===========================================

-- 1. Add version and parent_id columns to prompt_sets
ALTER TABLE public.prompt_sets 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.prompt_sets(id);

-- 2. Initialize parent_id for existing records
UPDATE public.prompt_sets 
SET parent_id = id 
WHERE parent_id IS NULL;

-- 3. (Optional) Create a unique constraint to ensure data integrity
-- Note: This is optional and may need care if you have existing name conflicts
-- ALTER TABLE public.prompt_sets ADD CONSTRAINT prompt_sets_parent_id_version_unique UNIQUE (parent_id, version);
