"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveWorkspaceForUser } from "@/features/workspaces/server";
import { DEMO_WORKSPACE_CONTEXT } from "@/features/workspaces/constants";
import { runAutonomousAgentEvaluation } from "./engine";
import { executeAgentPlan, ExecuteAgentPlanResult } from "./tools";
import { AgentActionPlan, AgentRunResult } from "./types";
import { Lead } from "@/features/leads/types";
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
    if (!activeWs) {
      return {
        success: false,
        error: "Authentication and workspace membership are required.",
      };
    }

    const supabase = await createServerSupabaseClient();
    const isDemo =
      !supabase ||
      activeWs.workspace.id === DEMO_WORKSPACE_CONTEXT.workspace.id;
    let lead: Lead | undefined;

    if (!isDemo && supabase) {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", params.leadId)
        .eq("workspace_id", activeWs.workspace.id)
        .single();
      if (error || !data) {
        return {
          success: false,
          error: "Lead not found in the active workspace.",
        };
      }
      lead = data as Lead;
    } else {
      lead = demoStore.getLead(params.leadId);
      if (!lead || lead.workspaceId !== activeWs.workspace.id) {
        return {
          success: false,
          error: "Lead not found in the active demo workspace.",
        };
      }
    }

    const evaluation = runAutonomousAgentEvaluation({
      lead,
      workspaceName: activeWs.workspace.name,
      senderName: activeWs.user.fullName || "Account Director",
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
  if (!activeWs) {
    return {
      success: false,
      stageUpdated: false,
      reminderScheduled: false,
      activityLogged: false,
      error: "Authentication and workspace membership are required.",
    };
  }

  const supabase = await createServerSupabaseClient();
  const isDemo =
    !supabase || activeWs.workspace.id === DEMO_WORKSPACE_CONTEXT.workspace.id;

  if (!supabase && !isDemo && process.env.NODE_ENV === "production") {
    return {
      success: false,
      stageUpdated: false,
      reminderScheduled: false,
      activityLogged: false,
      error: "Database is not configured.",
    };
  }

  let lead: Lead | undefined;
  if (!isDemo && supabase) {
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id, workspace_id, first_name, last_name, email, company_name, stage",
      )
      .eq("id", params.leadId)
      .eq("workspace_id", activeWs.workspace.id)
      .single();
    if (error || !data) {
      return {
        success: false,
        stageUpdated: false,
        reminderScheduled: false,
        activityLogged: false,
        error: "Lead not found in the active workspace.",
      };
    }
    lead = {
      id: data.id,
      workspaceId: data.workspace_id,
      firstName: data.first_name,
      lastName: data.last_name,
      email: data.email,
      companyName: data.company_name,
      stage: data.stage,
    } as Lead;
  } else {
    lead = demoStore.getLead(params.leadId);
    if (!lead || lead.workspaceId !== activeWs.workspace.id) {
      return {
        success: false,
        stageUpdated: false,
        reminderScheduled: false,
        activityLogged: false,
        error: "Lead not found in the active demo workspace.",
      };
    }
  }

  // Recompute the plan from the server-loaded lead. Never execute a plan supplied
  // by the browser because a caller can tamper with server-action arguments.
  const trustedEvaluation = runAutonomousAgentEvaluation({
    lead,
    workspaceName: activeWs.workspace.name,
    senderName: activeWs.user.fullName || "Account Director",
  });
  const trustedPlan = trustedEvaluation.plan;

  return executeAgentPlan({
    supabase: isDemo ? null : supabase,
    workspaceId: activeWs.workspace.id,
    leadId: lead.id,
    userId: activeWs.user.id,
    plan: trustedPlan,
    leadName: [lead.firstName, lead.lastName].filter(Boolean).join(" "),
    leadEmail: lead.email || undefined,
    companyName: lead.companyName || undefined,
  });
}
