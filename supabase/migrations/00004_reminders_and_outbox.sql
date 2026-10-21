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
