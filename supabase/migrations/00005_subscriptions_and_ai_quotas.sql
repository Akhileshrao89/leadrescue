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
