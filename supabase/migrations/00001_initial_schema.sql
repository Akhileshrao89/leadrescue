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
