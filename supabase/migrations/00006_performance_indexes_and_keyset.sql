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
