import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  type ActiveWorkspaceContext,
  DEMO_WORKSPACE_CONTEXT,
} from "./constants";
import { getActiveWorkspaceForUser } from "./server";

export type UserRole = "OWNER" | "ADMIN" | "MEMBER";

export type PermissionAction =
  | "lead:view"
  | "lead:create"
  | "lead:update"
  | "lead:delete"
  | "lead:archive"
  | "activity:view"
  | "activity:create"
  | "workspace:view"
  | "workspace:update"
  | "workspace:delete"
  | "member:view"
  | "member:invite"
  | "member:update_role"
  | "member:remove"
  | "billing:view"
  | "billing:manage"
  | "import:execute";

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  OWNER: 30,
  ADMIN: 20,
  MEMBER: 10,
};

export const ROLE_PERMISSIONS: Record<UserRole, readonly PermissionAction[]> = {
  OWNER: [
    "lead:view",
    "lead:create",
    "lead:update",
    "lead:delete",
    "lead:archive",
    "activity:view",
    "activity:create",
    "workspace:view",
    "workspace:update",
    "workspace:delete",
    "member:view",
    "member:invite",
    "member:update_role",
    "member:remove",
    "billing:view",
    "billing:manage",
    "import:execute",
  ],
  ADMIN: [
    "lead:view",
    "lead:create",
    "lead:update",
    "lead:delete",
    "lead:archive",
    "activity:view",
    "activity:create",
    "workspace:view",
    "workspace:update",
    "member:view",
    "member:invite",
    "member:update_role",
    "member:remove",
    "billing:view",
    "import:execute",
  ],
  MEMBER: [
    "lead:view",
    "lead:create",
    "lead:update",
    "activity:view",
    "activity:create",
    "workspace:view",
    "member:view",
    "import:execute",
  ],
};

/**
 * Checks if a given role is at or above a required minimum role tier.
 */
export function hasRoleAtLeast(
  currentRole: UserRole,
  requiredRole: UserRole,
): boolean {
  return ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Checks if a given role possesses a specific permission action.
 */
export function hasPermission(
  role: UserRole,
  action: PermissionAction,
): boolean {
  const allowed = ROLE_PERMISSIONS[role];
  return allowed ? allowed.includes(action) : false;
}

export class AuthorizationError extends Error {
  readonly statusCode: 401 | 403;

  constructor(message: string, statusCode: 401 | 403 = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
  }
}

export interface VerifyMembershipOptions {
  workspaceId?: string;
  requiredRole?: UserRole;
  requiredAction?: PermissionAction;
}

export type VerifyMembershipResult =
  | {
      authorized: true;
      context: ActiveWorkspaceContext;
    }
  | {
      authorized: false;
      error: string;
      statusCode: 401 | 403;
    };

/**
 * Verifies that the caller is authenticated, belongs to the specified workspace,
 * and possesses the required role/action permission.
 */
export async function verifyWorkspaceMembership(
  options: VerifyMembershipOptions = {},
): Promise<VerifyMembershipResult> {
  let context: ActiveWorkspaceContext | null = null;

  if (options.workspaceId) {
    if (options.workspaceId === DEMO_WORKSPACE_CONTEXT.workspace.id) {
      context = DEMO_WORKSPACE_CONTEXT;
    } else {
      const supabase = await createServerSupabaseClient();
      if (!supabase) {
        context = DEMO_WORKSPACE_CONTEXT;
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || !user.email) {
          return {
            authorized: false,
            error: "Unauthorized: Valid session required",
            statusCode: 401,
          };
        }

        // Specifically verify membership in the requested workspace (prevents cross-tenant IDOR)
        const { data: membership, error } = await supabase
          .from("memberships")
          .select("role, workspace:workspaces(id, name, slug, timezone)")
          .eq("workspace_id", options.workspaceId)
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (error || !membership || !membership.workspace) {
          return {
            authorized: false,
            error: "Forbidden: You are not a member of this workspace.",
            statusCode: 403,
          };
        }

        const ws = Array.isArray(membership.workspace)
          ? membership.workspace[0]
          : membership.workspace;

        context = {
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
          role: membership.role as UserRole,
        };
      }
    }
  } else {
    context = await getActiveWorkspaceForUser();
    if (!context) {
      return {
        authorized: false,
        error: "Unauthorized: Active workspace membership required.",
        statusCode: 401,
      };
    }
  }

  // Verify Role Requirement
  if (options.requiredRole) {
    if (!hasRoleAtLeast(context.role, options.requiredRole)) {
      return {
        authorized: false,
        error: `Forbidden: Action requires at least ${options.requiredRole} role. Your role is ${context.role}.`,
        statusCode: 403,
      };
    }
  }

  // Verify Action Permission Requirement
  if (options.requiredAction) {
    if (!hasPermission(context.role, options.requiredAction)) {
      return {
        authorized: false,
        error: `Forbidden: Your role (${context.role}) does not have permission to execute '${options.requiredAction}'.`,
        statusCode: 403,
      };
    }
  }

  return {
    authorized: true,
    context,
  };
}

/**
 * Convenience helper that throws AuthorizationError if verification fails.
 */
export async function requireWorkspaceMembership(
  options: VerifyMembershipOptions = {},
): Promise<ActiveWorkspaceContext> {
  const result = await verifyWorkspaceMembership(options);
  if (!result.authorized) {
    throw new AuthorizationError(result.error, result.statusCode);
  }
  return result.context;
}
