"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifyWorkspaceMembership } from "./rbac";
import { DEMO_WORKSPACE_CONTEXT } from "./constants";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const UpdateWorkspaceSchema = z.object({
  name: z
    .string()
    .min(2, "Workspace name must be at least 2 characters")
    .max(100),
  timezone: z.string().min(1, "Timezone is required"),
});

export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>;

export type WorkspaceActionResult = {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Updates workspace settings (name, timezone).
 * Enforces RBAC: requires ADMIN or OWNER role.
 */
export async function updateWorkspaceSettingsAction(
  values: UpdateWorkspaceInput,
  workspaceId?: string,
): Promise<WorkspaceActionResult> {
  const validation = UpdateWorkspaceSchema.safeParse(values);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.issues.forEach((issue) => {
      if (issue.path[0]) fieldErrors[issue.path[0].toString()] = issue.message;
    });
    return { error: "Validation failed", fieldErrors };
  }

  // RBAC guard: requires 'workspace:update' permission (ADMIN or OWNER)
  const authResult = await verifyWorkspaceMembership({
    workspaceId,
    requiredAction: "workspace:update",
  });

  if (!authResult.authorized) {
    return { error: authResult.error };
  }

  const targetWorkspaceId = authResult.context.workspace.id;

  const supabase = await createServerSupabaseClient();
  if (!supabase || targetWorkspaceId === DEMO_WORKSPACE_CONTEXT.workspace.id) {
    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return { success: true };
  }

  const { error: updateError } = await supabase
    .from("workspaces")
    .update({
      name: validation.data.name.trim(),
      timezone: validation.data.timezone.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetWorkspaceId);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");

  return { success: true };
}

/**
 * Deletes a workspace and cascades all associated data.
 * Enforces RBAC: strictly requires OWNER role.
 */
export async function deleteWorkspaceAction(
  workspaceId?: string,
): Promise<WorkspaceActionResult> {
  // RBAC guard: strictly requires 'workspace:delete' permission (OWNER only)
  const authResult = await verifyWorkspaceMembership({
    workspaceId,
    requiredAction: "workspace:delete",
  });

  if (!authResult.authorized) {
    return { error: authResult.error };
  }

  const targetWorkspaceId = authResult.context.workspace.id;

  const supabase = await createServerSupabaseClient();
  if (!supabase || targetWorkspaceId === DEMO_WORKSPACE_CONTEXT.workspace.id) {
    return { error: "Demo workspace cannot be deleted." };
  }

  const { error: deleteError } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", targetWorkspaceId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  return { success: true };
}
