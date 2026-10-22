"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifyWorkspaceMembership } from "@/features/workspaces/rbac";
import { DEMO_WORKSPACE_CONTEXT } from "@/features/workspaces/constants";
import { demoStore } from "@/features/leads/demo-store";
import { generateDeterministicTemplate } from "./templates";
import { GenerateDraftInputSchema, GenerateDraftInputValues } from "./schema";
import { generateFollowUpDraft } from "./service";
import { getWorkspaceAiQuota } from "./quotas";
import { GeneratedDraftResult, QuotaStatus } from "./types";

export type DraftActionResult =
  | {
      success: true;
      data: GeneratedDraftResult;
    }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string>;
    };

export type QuotaActionResult =
  | {
      success: true;
      data: QuotaStatus;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Server Action: Generates an AI or template-assisted follow-up message draft.
 * Requires human review before sending. Under no circumstance sends messages automatically.
 */
export async function generateFollowUpDraftAction(
  values: GenerateDraftInputValues,
): Promise<DraftActionResult> {
  const parsed = GenerateDraftInputSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      if (issue.path[0]) fieldErrors[issue.path[0].toString()] = issue.message;
    });
    return {
      success: false,
      error: "Validation failed",
      fieldErrors,
    };
  }

  const { workspaceId, leadId, touchpointType, tone, useAi } = parsed.data;

  const authResult = await verifyWorkspaceMembership({
    requiredAction: "lead:view",
  });
  if (!authResult.authorized) {
    return {
      success: false,
      error: authResult.statusCode === 401 ? "Unauthorized" : authResult.error,
    };
  }

  // Ensure workspace matches authenticated context
  if (authResult.context.workspace.id !== workspaceId) {
    return {
      success: false,
      error: "Forbidden: Cannot access another workspace's leads.",
    };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase || workspaceId === DEMO_WORKSPACE_CONTEXT.workspace.id) {
    const lead = demoStore.getLead(leadId);
    if (!lead) {
      return { success: false, error: "Lead not found in demo workspace." };
    }
    const template = generateDeterministicTemplate(touchpointType, tone, {
      firstName: lead.firstName,
      companyName: lead.companyName,
      senderAgencyName: authResult.context.workspace.name,
      senderName: authResult.context.user.fullName || "Alex Vance",
    });
    return {
      success: true,
      data: {
        subject: template.subject,
        body: template.body,
        isAiGenerated: false,
        quotaRemaining: 236,
        generationDurationMs: 15,
      },
    };
  }

  const result = await generateFollowUpDraft(supabase, {
    workspaceId,
    leadId,
    userId: authResult.context.user.id,
    touchpointType,
    tone,
    useAi,
  });

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error || "Failed to generate draft.",
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

/**
 * Server Action: Retrieves the current workspace's monthly AI draft quota.
 */
export async function fetchDraftQuotaAction(
  workspaceId?: string,
): Promise<QuotaActionResult> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "lead:view",
  });
  if (!authResult.authorized) {
    return {
      success: false,
      error: authResult.statusCode === 401 ? "Unauthorized" : authResult.error,
    };
  }

  const targetWsId = workspaceId || authResult.context.workspace.id;
  if (targetWsId !== authResult.context.workspace.id) {
    return {
      success: false,
      error: "Forbidden: Cross-workspace access denied.",
    };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase || targetWsId === DEMO_WORKSPACE_CONTEXT.workspace.id) {
    return {
      success: true,
      data: {
        quota: 250,
        used: 14,
        remaining: 236,
        tier: "AGENCY",
      },
    };
  }

  const quota = await getWorkspaceAiQuota(supabase, targetWsId);
  return {
    success: true,
    data: quota,
  };
}
