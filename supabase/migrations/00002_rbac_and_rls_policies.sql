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
