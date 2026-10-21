import { createServerSupabaseClient } from "@/lib/supabase/server";

export interface ActiveWorkspaceContext {
  user: {
    id: string;
    email: string;
    fullName?: string;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  role: "OWNER" | "ADMIN" | "MEMBER";
}

export const DEMO_WORKSPACE_CONTEXT: ActiveWorkspaceContext = {
  user: {
    id: "usr_demo_agency_owner",
    email: "owner@apexstudios.example.com",
    fullName: "Alex Vance",
  },
  workspace: {
    id: "ws_demo_agency",
    name: "Apex Web & SEO Studio",
    slug: "apex-studios",
    timezone: "America/New_York",
  },
  role: "OWNER",
};

/**
 * Resolves the authenticated user's active workspace and membership role server-side.
 * Strictly verifies identity via Supabase Auth and database membership checks.
 * Falls back to local agency owner demo context when running in unconfigured dev environment.
 */
export async function getActiveWorkspaceForUser(): Promise<ActiveWorkspaceContext | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return DEMO_WORKSPACE_CONTEXT;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return null;

  // Query first active membership for this user, including workspace metadata
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("role, workspace:workspaces(id, name, slug, timezone)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (error || !membership || !membership.workspace) {
    return null;
  }

  // Workaround for Supabase type inference on joined relation
  const ws = Array.isArray(membership.workspace)
    ? membership.workspace[0]
    : membership.workspace;

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: (user.user_metadata?.full_name as string) || undefined,
    },
    workspace: {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      timezone: ws.timezone || "UTC",
    },
    role: membership.role as "OWNER" | "ADMIN" | "MEMBER",
  };
}
