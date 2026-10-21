"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveWorkspaceForUser } from "@/features/workspaces/server";
import { runAutonomousAgentEvaluation } from "./engine";
import { executeAgentPlan, ExecuteAgentPlanResult } from "./tools";
import { AgentActionPlan, AgentRunResult } from "./types";
import { Lead } from "@/features/leads/types";
import { MOCK_LEADS } from "@/features/leads/fixtures";
import { demoStore } from "@/features/leads/demo-store";

/**
 * Server Action: Triggers autonomous multi-dimensional evaluation of a prospect.
 */
export async function runAgentEvaluationAction(params: {
  leadId: string;
  leadOverride?: Lead;
}): Promise<{ success: boolean; data?: AgentRunResult; error?: string }> {
  try {
    const activeWs = await getActiveWorkspaceForUser();
    const workspaceName = activeWs?.workspace.name || "Apex Agency";
    const senderName = activeWs?.user.fullName || "Account Director";

    let lead: Lead | undefined = params.leadOverride;

    if (!lead) {
      const supabase = await createServerSupabaseClient();
      if (supabase && activeWs) {
        const { data, error } = await supabase
          .from("leads")
          .select("*")
          .eq("id", params.leadId)
          .eq("workspace_id", activeWs.workspace.id)
          .single();

        if (!error && data) {
          lead = data as Lead;
        }
      }
    }

    // Fallback to mutable demo store or fixtures if database is not active
    if (!lead) {
      lead =
        demoStore.getLead(params.leadId) ||
        MOCK_LEADS.find((l) => l.id === params.leadId) ||
        MOCK_LEADS[0];
    }

    const evaluation = runAutonomousAgentEvaluation({
      lead,
      workspaceName,
      senderName,
    });

    return { success: true, data: evaluation };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Failed to run agent evaluation",
    };
  }
}

/**
 * Server Action: Executes the agent's recommended action plan in 1 click.
 */
export async function executeAgentPlanAction(params: {
  leadId: string;
  plan: AgentActionPlan;
  leadName?: string;
  leadEmail?: string;
  companyName?: string;
}): Promise<ExecuteAgentPlanResult> {
  const activeWs = await getActiveWorkspaceForUser();
  const supabase = await createServerSupabaseClient();

  const workspaceId = activeWs?.workspace.id || "ws_demo_agency";
  const userId = activeWs?.user.id || "usr_demo_user";

  return executeAgentPlan({
    supabase,
    workspaceId,
    leadId: params.leadId,
    userId,
    plan: params.plan,
    leadName: params.leadName,
    leadEmail: params.leadEmail,
    companyName: params.companyName,
  });
}
