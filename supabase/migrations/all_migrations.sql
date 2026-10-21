-- ============================================================================
-- Migration: 00001_initial_schema.sql
-- Description: Core Phase 3 tables, constraints, indexes, RLS and functions
-- ============================================================================

-- 1. Enable necessary cryptographic and UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Enumerated types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE lead_stage AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE lead_activity_type AS ENUM (
        'NOTE_ADDED', 
        'STAGE_CHANGED', 
        'FOLLOW_UP_SCHEDULED', 
        'FOLLOW_UP_COMPLETED', 
        'REMINDER_SENT', 
        'IMPORTED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. PROFILES Table (Mirrors auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. WORKSPACES Table (Multi-tenant root)
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT ck_workspace_slug CHECK (slug ~* '^[a-z0-9-]+$')
);

-- 5. MEMBERSHIPS Table (RBAC bridge)
CREATE TABLE IF NOT EXISTS public.memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'MEMBER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_workspace_user UNIQUE (workspace_id, user_id)
);

-- 6. LEADS Table
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(30),
    company_name VARCHAR(150),
    website VARCHAR(255),
    stage lead_stage NOT NULL DEFAULT 'NEW',
    source VARCHAR(50) DEFAULT 'manual',
    notes TEXT,
    last_contacted_at TIMESTAMPTZ,
    next_follow_up_at TIMESTAMPTZ,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT ck_contact_present CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Unique active lead email within a workspace
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_workspace_email 
ON public.leads (workspace_id, lower(trim(email))) 
WHERE email IS NOT NULL AND is_archived = false;

-- Composite indexes for optimal queue and pipeline queries
CREATE INDEX IF NOT EXISTS idx_leads_workspace_queue 
ON public.leads (workspace_id, is_archived, next_follow_up_at);

CREATE INDEX IF NOT EXISTS idx_leads_workspace_stage 
ON public.leads (workspace_id, is_archived, stage, created_at DESC);

-- 7. LEAD ACTIVITIES Table (Immutable audit trail)
CREATE TABLE IF NOT EXISTS public.lead_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type lead_activity_type NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_activities_lead_created 
ON public.lead_activities (lead_id, created_at DESC);

-- ============================================================================
-- 8. SECURITY & ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Helper function: checks if auth.uid() is an active member of workspace
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE workspace_id = ws_id
      AND user_id = auth.uid()
  );
$$;

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can read own profile"
ON public.profiles FOR SELECT
USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Workspaces Policies
CREATE POLICY "Members can view their workspaces"
ON public.workspaces FOR SELECT
USING (public.is_workspace_member(id));

CREATE POLICY "Owners and Admins can update workspace"
ON public.workspaces FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships
    WHERE workspace_id = workspaces.id
      AND user_id = auth.uid()
      AND role IN ('OWNER', 'ADMIN')
  )
);

-- Memberships Policies
CREATE POLICY "Members can view workspace memberships"
ON public.memberships FOR SELECT
USING (public.is_workspace_member(workspace_id));

-- Leads Policies
CREATE POLICY "Members can view workspace leads"
ON public.leads FOR SELECT
USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Members can create workspace leads"
ON public.leads FOR INSERT
WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Members can update workspace leads"
ON public.leads FOR UPDATE
USING (public.is_workspace_member(workspace_id))
WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Admins and Owners can delete workspace leads"
ON public.leads FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.memberships
    WHERE workspace_id = leads.workspace_id
      AND user_id = auth.uid()
      AND role IN ('OWNER', 'ADMIN')
  )
);

-- Lead Activities Policies
CREATE POLICY "Members can view workspace activities"
ON public.lead_activities FOR SELECT
USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Members can insert workspace activities"
ON public.lead_activities FOR INSERT
WITH CHECK (public.is_workspace_member(workspace_id));

-- ============================================================================
-- 9. ATOMIC WORKSPACE ONBOARDING PROCEDURE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_workspace_for_user(
  p_name VARCHAR(100),
  p_slug VARCHAR(50),
  p_timezone VARCHAR(50) DEFAULT 'UTC'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_workspace_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ensure profile exists
  INSERT INTO public.profiles (id, email)
  SELECT id, email FROM auth.users WHERE id = v_user_id
  ON CONFLICT (id) DO NOTHING;

  -- Create Workspace
  INSERT INTO public.workspaces (name, slug, timezone)
  VALUES (p_name, p_slug, p_timezone)
  RETURNING id INTO v_workspace_id;

  -- Create Initial Membership as OWNER
  INSERT INTO public.memberships (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'OWNER');

  RETURN v_workspace_id;
END;
$$;
-- ============================================================================
-- Migration: 00002_rbac_and_rls_policies.sql
-- Description: Phase 4 Enhanced Role-Based Access Control (RBAC) and Multi-Tenant RLS
-- ============================================================================

-- 1. Helper function: checks if auth.uid() has any of the specified roles in workspace
CREATE OR REPLACE FUNCTION public.has_workspace_role(
  ws_id UUID,
  allowed_roles user_role[]
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE workspace_id = ws_id
      AND user_id = auth.uid()
      AND role = ANY(allowed_roles)
  );
$$;

-- 2. Enhanced Memberships RLS Policies
DROP POLICY IF EXISTS "Admins and Owners can insert memberships" ON public.memberships;
CREATE POLICY "Admins and Owners can insert memberships"
ON public.memberships FOR INSERT
WITH CHECK (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role])
);

DROP POLICY IF EXISTS "Admins and Owners can update memberships" ON public.memberships;
CREATE POLICY "Admins and Owners can update memberships"
ON public.memberships FOR UPDATE
USING (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role])
)
WITH CHECK (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role])
);

DROP POLICY IF EXISTS "Admins and Owners can delete memberships" ON public.memberships;
CREATE POLICY "Admins and Owners can delete memberships"
ON public.memberships FOR DELETE
USING (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role])
  AND (role != 'OWNER'::user_role OR user_id = auth.uid())
);

-- 3. Enhanced Workspaces RLS Policy: Only OWNER can delete workspace
DROP POLICY IF EXISTS "Owners can delete workspace" ON public.workspaces;
CREATE POLICY "Owners can delete workspace"
ON public.workspaces FOR DELETE
USING (
  public.has_workspace_role(id, ARRAY['OWNER'::user_role])
);

-- 4. Standardized Leads RLS Delete Policy using has_workspace_role
DROP POLICY IF EXISTS "Admins and Owners can delete workspace leads" ON public.leads;
CREATE POLICY "Admins and Owners can delete workspace leads"
ON public.leads FOR DELETE
USING (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role])
);
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
-- ============================================================================
-- Migration: 00004_reminders_and_outbox.sql
-- Description: Phase 7 Follow-Up Queue, Reminders & Transactional Outbox
-- ============================================================================

-- 1. Enumerated Types for Reminders & Outbox
DO $$ BEGIN
    CREATE TYPE reminder_status AS ENUM ('QUEUED', 'SENT', 'FAILED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE outbox_status AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'DEAD_LETTER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. REMINDERS Table
CREATE TABLE IF NOT EXISTS public.reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    due_at TIMESTAMPTZ NOT NULL,
    status reminder_status NOT NULL DEFAULT 'QUEUED',
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    sent_at TIMESTAMPTZ,
    error_message VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. TRANSACTIONAL OUTBOX / DURABLE JOBS Table
CREATE TABLE IF NOT EXISTS public.outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status outbox_status NOT NULL DEFAULT 'QUEUED',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    available_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    lease_token UUID,
    lease_expires_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Query-Optimized Indexes
-- Rapid dispatch lookup for due reminders
CREATE INDEX IF NOT EXISTS idx_reminders_due_dispatch 
ON public.reminders (status, due_at) 
WHERE status = 'QUEUED';

CREATE INDEX IF NOT EXISTS idx_reminders_lead 
ON public.reminders (lead_id);

CREATE INDEX IF NOT EXISTS idx_reminders_workspace 
ON public.reminders (workspace_id, created_at DESC);

-- Partial index allowing outbox worker to claim ready jobs with zero lock contention
CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed 
ON public.outbox_events (status, available_at) 
WHERE status = 'QUEUED';

CREATE INDEX IF NOT EXISTS idx_outbox_workspace 
ON public.outbox_events (workspace_id, created_at DESC);

-- 5. Row Level Security (RLS)
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

-- Reminders Policies
DROP POLICY IF EXISTS "Workspace members can view reminders" ON public.reminders;
CREATE POLICY "Workspace members can view reminders"
ON public.reminders FOR SELECT
USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members can insert reminders" ON public.reminders;
CREATE POLICY "Members can insert reminders"
ON public.reminders FOR INSERT
WITH CHECK (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role, 'MEMBER'::user_role])
);

DROP POLICY IF EXISTS "Members can update reminders" ON public.reminders;
CREATE POLICY "Members can update reminders"
ON public.reminders FOR UPDATE
USING (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role, 'MEMBER'::user_role])
);

DROP POLICY IF EXISTS "Admins and Owners can delete reminders" ON public.reminders;
CREATE POLICY "Admins and Owners can delete reminders"
ON public.reminders FOR DELETE
USING (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role])
);

-- Outbox Events Policies
DROP POLICY IF EXISTS "Workspace members can view outbox events" ON public.outbox_events;
CREATE POLICY "Workspace members can view outbox events"
ON public.outbox_events FOR SELECT
USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Members can insert outbox events" ON public.outbox_events;
CREATE POLICY "Members can insert outbox events"
ON public.outbox_events FOR INSERT
WITH CHECK (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role, 'MEMBER'::user_role])
);

DROP POLICY IF EXISTS "Members can update outbox events" ON public.outbox_events;
CREATE POLICY "Members can update outbox events"
ON public.outbox_events FOR UPDATE
USING (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role, 'MEMBER'::user_role])
);

DROP POLICY IF EXISTS "Admins and Owners can delete outbox events" ON public.outbox_events;
CREATE POLICY "Admins and Owners can delete outbox events"
ON public.outbox_events FOR DELETE
USING (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role])
);

-- 6. Atomic Outbox Batch Claim Procedure (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_outbox_batch(
  p_batch_size INTEGER,
  p_lease_duration_seconds INTEGER,
  p_lease_token UUID
)
RETURNS SETOF public.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT id
    FROM public.outbox_events
    WHERE (
      status = 'QUEUED' AND available_at <= timezone('utc'::text, now())
    ) OR (
      status = 'PROCESSING' AND lease_expires_at <= timezone('utc'::text, now())
    )
    ORDER BY available_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  UPDATE public.outbox_events o
  SET status = 'PROCESSING',
      lease_token = p_lease_token,
      lease_expires_at = timezone('utc'::text, now()) + (p_lease_duration_seconds || ' seconds')::interval,
      updated_at = timezone('utc'::text, now())
  FROM claimable
  WHERE o.id = claimable.id
  RETURNING o.*;
END;
$$;
-- ============================================================================
-- Migration: 00005_subscriptions_and_ai_quotas.sql
-- Description: Phase 8 Subscriptions, Tier Entitlements, and AI Quota Tracking
-- ============================================================================

-- 1. Enumerated Types for Subscriptions
DO $$ BEGIN
    CREATE TYPE subscription_tier AS ENUM ('FREE', 'STARTER', 'AGENCY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIALING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. SUBSCRIPTIONS Table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
    tier subscription_tier NOT NULL DEFAULT 'FREE',
    status subscription_status NOT NULL DEFAULT 'ACTIVE',
    max_active_leads INTEGER NOT NULL DEFAULT 100,
    max_members INTEGER NOT NULL DEFAULT 2,
    monthly_ai_drafts_quota INTEGER NOT NULL DEFAULT 20,
    ai_drafts_used INTEGER NOT NULL DEFAULT 0,
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '1 month'),
    external_customer_id VARCHAR(100) UNIQUE,
    external_subscription_id VARCHAR(100) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace 
ON public.subscriptions (workspace_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status 
ON public.subscriptions (status);

-- 4. Row Level Security (RLS)
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Workspace members can view subscriptions" ON public.subscriptions;
CREATE POLICY "Workspace members can view subscriptions"
ON public.subscriptions FOR SELECT
USING (public.is_workspace_member(workspace_id));

DROP POLICY IF EXISTS "Admins and Owners can insert subscriptions" ON public.subscriptions;
CREATE POLICY "Admins and Owners can insert subscriptions"
ON public.subscriptions FOR INSERT
WITH CHECK (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role])
);

DROP POLICY IF EXISTS "Admins and Owners can update subscriptions" ON public.subscriptions;
CREATE POLICY "Admins and Owners can update subscriptions"
ON public.subscriptions FOR UPDATE
USING (
  public.has_workspace_role(workspace_id, ARRAY['OWNER'::user_role, 'ADMIN'::user_role])
);

-- 5. Atomic Quota Consumption Procedure
CREATE OR REPLACE FUNCTION public.check_and_consume_ai_quota(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
  -- Lock subscription row for atomic update
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Automatically provision FREE tier subscription if not yet provisioned
    INSERT INTO public.subscriptions (
      workspace_id, tier, status, max_active_leads, max_members, monthly_ai_drafts_quota, ai_drafts_used
    ) VALUES (
      p_workspace_id, 'FREE', 'ACTIVE', 100, 2, 20, 1
    )
    RETURNING * INTO v_sub;

    RETURN jsonb_build_object(
      'allowed', true,
      'quota', v_sub.monthly_ai_drafts_quota,
      'used', 1,
      'remaining', v_sub.monthly_ai_drafts_quota - 1
    );
  END IF;

  -- Reset quota if monthly billing period has rolled over
  IF v_sub.current_period_end <= v_now THEN
    UPDATE public.subscriptions
    SET ai_drafts_used = 1,
        current_period_start = v_now,
        current_period_end = v_now + interval '1 month',
        updated_at = v_now
    WHERE id = v_sub.id;

    RETURN jsonb_build_object(
      'allowed', true,
      'quota', v_sub.monthly_ai_drafts_quota,
      'used', 1,
      'remaining', v_sub.monthly_ai_drafts_quota - 1
    );
  END IF;

  -- Check if monthly quota is exhausted
  IF v_sub.ai_drafts_used >= v_sub.monthly_ai_drafts_quota THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'quota', v_sub.monthly_ai_drafts_quota,
      'used', v_sub.ai_drafts_used,
      'remaining', 0,
      'error', 'Monthly AI drafting quota exceeded'
    );
  END IF;

  -- Increment usage counter
  UPDATE public.subscriptions
  SET ai_drafts_used = ai_drafts_used + 1,
      updated_at = v_now
  WHERE id = v_sub.id;

  RETURN jsonb_build_object(
    'allowed', true,
    'quota', v_sub.monthly_ai_drafts_quota,
    'used', v_sub.ai_drafts_used + 1,
    'remaining', v_sub.monthly_ai_drafts_quota - (v_sub.ai_drafts_used + 1)
  );
END;
$$;

-- 6. Read-Only Quota Inspection Procedure
CREATE OR REPLACE FUNCTION public.get_workspace_ai_quota(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'quota', 20,
      'used', 0,
      'remaining', 20,
      'tier', 'FREE'
    );
  END IF;

  RETURN jsonb_build_object(
    'quota', v_sub.monthly_ai_drafts_quota,
    'used', v_sub.ai_drafts_used,
    'remaining', GREATEST(0, v_sub.monthly_ai_drafts_quota - v_sub.ai_drafts_used),
    'tier', v_sub.tier
  );
END;
$$;
-- ============================================================================
-- Migration: 00006_performance_indexes_and_keyset.sql
-- Description: Composite keyset pagination indexes and active lead count acceleration
-- ============================================================================

-- 1. Composite Keyset Index for Follow-Up Queue
-- Optimizes keyset queries: (next_follow_up_at, id) > (cursor_date, cursor_id)
CREATE INDEX IF NOT EXISTS idx_leads_keyset_follow_up
ON public.leads (workspace_id, is_archived, next_follow_up_at ASC NULLS LAST, id ASC);

-- 2. Composite Keyset Index for Stage Filtered Views
CREATE INDEX IF NOT EXISTS idx_leads_keyset_stage
ON public.leads (workspace_id, is_archived, stage, created_at DESC, id DESC);

-- 3. Partial Index for Instant Active Lead Count (Quota Guard O(1) Check)
-- Allows checkLeadCreationQuota to do an index-only scan rather than full table scan
CREATE INDEX IF NOT EXISTS idx_leads_active_count
ON public.leads (workspace_id)
WHERE is_archived = false;

-- 4. Fast Lookup Index for Lead Search Queries
CREATE INDEX IF NOT EXISTS idx_leads_search_lookup
ON public.leads (workspace_id, is_archived, last_name, first_name);

-- 5. Outbox Worker Concurrency & Lease Reclaim Index
CREATE INDEX IF NOT EXISTS idx_outbox_lease_recovery
ON public.outbox_events (status, lease_expires_at)
WHERE status = 'PROCESSING';
