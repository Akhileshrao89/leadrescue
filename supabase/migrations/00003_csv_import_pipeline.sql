-- ============================================================================
-- Migration: 00003_csv_import_pipeline.sql
-- Description: Phase 6 CSV Import Jobs, Row Results, and RLS Policies
-- ============================================================================

-- 1. Enumerated Types for Imports
DO $$ BEGIN
    CREATE TYPE import_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE duplicate_policy AS ENUM ('SKIP', 'UPDATE', 'CONFLICT_REPORT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. IMPORT JOBS Table
CREATE TABLE IF NOT EXISTS public.import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    status import_status NOT NULL DEFAULT 'PENDING',
    total_rows INTEGER NOT NULL DEFAULT 0,
    processed_rows INTEGER NOT NULL DEFAULT 0,
    successful_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    duplicate_policy duplicate_policy NOT NULL DEFAULT 'SKIP',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. IMPORT ROW RESULTS Table (Row-level failure isolation)
CREATE TABLE IF NOT EXISTS public.import_row_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    raw_data JSONB NOT NULL,
    error_message VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_import_jobs_workspace 
ON public.import_jobs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_rows_job 
ON public.import_row_results (import_job_id, row_number);

-- 5. Row Level Security (RLS)
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_row_results ENABLE ROW LEVEL SECURITY;

-- Import Jobs Policies
DROP POLICY IF EXISTS "Workspace members can view import jobs" ON public.import_jobs;
CREATE POLICY "Workspace members can view import jobs"
ON public.import_jobs FOR SELECT
USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Admins and Owners can create import jobs" ON public.import_jobs;
CREATE POLICY "Admins and Owners can create import jobs"
ON public.import_jobs FOR INSERT
WITH CHECK (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role, 'MEMBER'::user_role])
);

DROP POLICY IF EXISTS "Admins and Owners can update import jobs" ON public.import_jobs;
CREATE POLICY "Admins and Owners can update import jobs"
ON public.import_jobs FOR UPDATE
USING (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role, 'MEMBER'::user_role])
);

-- Import Row Results Policies
DROP POLICY IF EXISTS "Workspace members can view import row results" ON public.import_row_results;
CREATE POLICY "Workspace members can view import row results"
ON public.import_row_results FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.import_jobs
    WHERE import_jobs.id = import_row_results.import_job_id
      AND public.is_workspace_member(import_jobs.workspace_id)
  )
);

DROP POLICY IF EXISTS "Members can insert import row results" ON public.import_row_results;
CREATE POLICY "Members can insert import row results"
ON public.import_row_results FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.import_jobs
    WHERE import_jobs.id = import_row_results.import_job_id
      AND public.has_workspace_role(import_jobs.workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role, 'MEMBER'::user_role])
  )
);
