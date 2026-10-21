import { SupabaseClient } from "@supabase/supabase-js";
import { AgentActionPlan } from "./types";
import { scheduleReminderForLead } from "@/features/reminders/manager";
import { logger } from "@/lib/security/logger";
import { demoStore } from "@/features/leads/demo-store";

export interface ExecuteAgentPlanParams {
  supabase: SupabaseClient | null;
  workspaceId: string;
  leadId: string;
  userId: string;
  plan: AgentActionPlan;
  leadName?: string;
  leadEmail?: string;
  companyName?: string;
}

export interface ExecuteAgentPlanResult {
  success: boolean;
  stageUpdated: boolean;
  reminderScheduled: boolean;
  reminderId?: string;
  activityLogged: boolean;
  error?: string;
}

/**
 * Autonomous Tool Execution Layer.
 * Executes the agent's synthesized strategy across stage transitions, reminders, and activity logs.
 */
export async function executeAgentPlan(
  params: ExecuteAgentPlanParams,
): Promise<ExecuteAgentPlanResult> {
  const {
    supabase,
    workspaceId,
    leadId,
    userId,
    plan,
    leadName,
    leadEmail,
    companyName,
  } = params;

  let stageUpdated = false;
  let reminderScheduled = false;
  let activityLogged = false;
  let reminderId: string | undefined;

  // Calculate reminder date based on agent recommendation
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + (plan.followUpOffsetDays || 2));
  dueAt.setHours(10, 0, 0, 0); // 10:00 AM

  if (!supabase) {
    // Demo Mode execution against mutable demoStore
    const lead = demoStore.getLead(leadId);
    if (lead) {
      demoStore.updateLead(leadId, {
        stage: plan.recommendedStage,
        nextFollowUpAt: dueAt.toISOString(),
      });
      stageUpdated = true;

      const scheduleRes = demoStore.scheduleReminder({
        workspaceId,
        leadId,
        recipientUserId: userId,
        dueAt: dueAt.toISOString(),
        leadName:
          leadName || [lead.firstName, lead.lastName].filter(Boolean).join(" "),
        leadEmail: leadEmail || lead.email || undefined,
        companyName: companyName || lead.companyName || undefined,
      });
      reminderScheduled = true;
      reminderId = scheduleRes.reminderId;

      demoStore.addActivity({
        workspaceId,
        leadId,
        userId,
        type: "FOLLOW_UP_SCHEDULED",
        details: {
          recommendedStage: plan.recommendedStage,
          offsetDays: plan.followUpOffsetDays,
          action: "Autonomous agent plan executed",
          tacticalReasoning:
            plan.reasoningTrace?.join("; ") || "Autonomous evaluation",
        },
      });
      activityLogged = true;
    } else {
      stageUpdated = true;
      reminderScheduled = true;
      reminderId = `rem_demo_agent_${Date.now()}`;
      activityLogged = true;
    }

    logger.audit({
      event: "AGENT_PLAN_EXECUTED_DEMO",
      workspaceId,
      userId,
      details: {
        leadId,
        recommendedStage: plan.recommendedStage,
        offsetDays: plan.followUpOffsetDays,
      },
    });

    return {
      success: true,
      stageUpdated,
      reminderScheduled,
      reminderId,
      activityLogged,
    };
  }

  try {
    // 1. Update lead stage and next_follow_up_at
    const { error: stageErr } = await supabase
      .from("leads")
      .update({
        stage: plan.recommendedStage,
        next_follow_up_at: dueAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId)
      .eq("workspace_id", workspaceId);

    if (!stageErr) stageUpdated = true;

    // 2. Schedule follow-up reminder in outbox
    const reminderRes = await scheduleReminderForLead(supabase, {
      workspaceId,
      leadId,
      recipientUserId: userId,
      dueAt,
      leadName,
      leadEmail,
      companyName,
    });

    if (reminderRes.success) {
      reminderScheduled = true;
      reminderId = reminderRes.reminderId;
    }

    // 3. Log agent strategy in activity_logs
    const { error: actErr } = await supabase.from("activity_logs").insert({
      workspace_id: workspaceId,
      lead_id: leadId,
      user_id: userId,
      activity_type: "STAGE_CHANGED",
      notes: `[AI Autonomous Agent] Executed strategy: ${plan.reasoningTrace[plan.reasoningTrace.length - 1]} | Scheduled next touchpoint in ${plan.followUpOffsetDays} days.`,
    });

    if (!actErr) activityLogged = true;

    logger.audit({
      event: "AGENT_PLAN_EXECUTED",
      workspaceId,
      userId,
      details: {
        leadId,
        stageUpdated,
        reminderScheduled,
        activityLogged,
      },
    });

    return {
      success: true,
      stageUpdated,
      reminderScheduled,
      reminderId,
      activityLogged,
    };
  } catch (err) {
    logger.error("Failed to execute agent plan", { error: String(err) });
    return {
      success: false,
      stageUpdated,
      reminderScheduled,
      activityLogged,
      error: err instanceof Error ? err.message : "Execution failed",
    };
  }
}
