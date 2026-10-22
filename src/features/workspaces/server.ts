import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  type ActiveWorkspaceContext,
  DEMO_WORKSPACE_CONTEXT,
} from "./constants";

export * from "./constants";

/**
 * Resolves the authenticated user's active workspace and membership role server-side.
 * Strictly verifies identity via Supabase Auth and database membership checks.
 * Falls back to local agency owner demo context when running in unconfigured dev environment or demo session.
 */
export async function getActiveWorkspaceForUser(): Promise<ActiveWorkspaceContext | null> {
  let isDemoSession = false;
  try {
    const cookieStore = await cookies();
    isDemoSession = cookieStore.get("leadrescue_demo")?.value === "true";
  } catch {
    // In background workers or isolated contexts where cookies() is unavailable
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return DEMO_WORKSPACE_CONTEXT;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    if (isDemoSession) {
      return DEMO_WORKSPACE_CONTEXT;
    }
    return null;
  }

  // Query first active membership for this user, including workspace metadata
  const { data: membership, error } = await supabase
    .from("memberships")
    .select("role, workspace:workspaces(id, name, slug, timezone)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (error || !membership || !membership.workspace) {
    if (isDemoSession) {
      return DEMO_WORKSPACE_CONTEXT;
    }
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
