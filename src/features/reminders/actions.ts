"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifyWorkspaceMembership } from "@/features/workspaces/rbac";
import { DEMO_WORKSPACE_CONTEXT } from "@/features/workspaces/constants";
import { runOutboxWorkerTick } from "./runner";
import {
  fetchWorkspaceReminders,
  scheduleReminderForLead,
  cancelPendingRemindersForLead,
} from "./manager";
import { Reminder, ReminderFilterOptions, WorkerRunResult } from "./types";
import { revalidatePath } from "next/cache";
import { demoStore } from "@/features/leads/demo-store";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Fetches reminders for the current active workspace.
 */
export async function fetchUpcomingRemindersAction(
  options: ReminderFilterOptions = {},
): Promise<ActionResult<Reminder[]>> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "lead:view",
  });
  if (!authResult.authorized) {
    return {
      success: false,
      error: authResult.statusCode === 401 ? "Unauthorized" : authResult.error,
    };
  }

  const supabase = await createServerSupabaseClient();
  if (
    !supabase ||
    authResult.context.workspace.id === DEMO_WORKSPACE_CONTEXT.workspace.id
  ) {
    const reminders = demoStore.listReminders(options);
    return { success: true, data: reminders };
  }

  const { workspace } = authResult.context;
  const result = await fetchWorkspaceReminders(supabase, workspace.id, options);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, data: result.reminders };
}

/**
 * Manually schedules or updates a reminder for a lead.
 */
export async function scheduleReminderAction(
  leadId: string,
  dueAt: string,
): Promise<ActionResult<{ reminderId: string }>> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "lead:update",
  });
  if (!authResult.authorized) {
    return {
      success: false,
      error: authResult.statusCode === 401 ? "Unauthorized" : authResult.error,
    };
  }

  const supabase = await createServerSupabaseClient();
  const { workspace, user } = authResult.context;

  if (!supabase || workspace.id === DEMO_WORKSPACE_CONTEXT.workspace.id) {
    const lead = demoStore.getLead(leadId);
    if (!lead) return { success: false, error: "Lead not found in workspace" };
    const res = demoStore.scheduleReminder({
      workspaceId: workspace.id,
      leadId,
      recipientUserId: user.id,
      dueAt,
      leadName: [lead.firstName, lead.lastName].filter(Boolean).join(" "),
      leadEmail: lead.email || undefined,
      companyName: lead.companyName || undefined,
    });
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/leads/${leadId}`);
    return { success: true, data: { reminderId: res.reminderId } };
  }

  // Verify lead belongs to workspace
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, first_name, last_name, company_name, email")
    .eq("id", leadId)
    .eq("workspace_id", workspace.id)
    .single();

  if (leadErr || !lead) {
    return { success: false, error: "Lead not found in workspace" };
  }

  // Cancel prior pending reminders for this lead first
  await cancelPendingRemindersForLead(
    supabase,
    workspace.id,
    leadId,
    "Rescheduled follow-up",
  );

  const res = await scheduleReminderForLead(supabase, {
    workspaceId: workspace.id,
    leadId: lead.id,
    recipientUserId: user.id,
    dueAt,
    leadName: [lead.first_name, lead.last_name].filter(Boolean).join(" "),
    leadEmail: lead.email || undefined,
    companyName: lead.company_name || undefined,
  });

  if (!res.success || !res.reminderId) {
    return {
      success: false,
      error: res.error || "Failed to schedule reminder",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${leadId}`);

  return { success: true, data: { reminderId: res.reminderId } };
}

/**
 * Cancels a specific reminder.
 */
export async function cancelReminderAction(
  reminderId: string,
): Promise<ActionResult> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "lead:update",
  });
  if (!authResult.authorized) {
    return {
      success: false,
      error: authResult.statusCode === 401 ? "Unauthorized" : authResult.error,
    };
  }

  const supabase = await createServerSupabaseClient();
  if (
    !supabase ||
    authResult.context.workspace.id === DEMO_WORKSPACE_CONTEXT.workspace.id
  ) {
    demoStore.cancelReminder(reminderId);
    revalidatePath("/dashboard");
    return { success: true };
  }

  const { workspace } = authResult.context;

  const { error } = await supabase
    .from("reminders")
    .update({
      status: "CANCELLED",
      error_message: "Cancelled by user",
      updated_at: new Date().toISOString(),
    })
    .eq("id", reminderId)
    .eq("workspace_id", workspace.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Triggers a worker tick to process ready outbox jobs.
 * Authorized for all workspace members for immediate testing and cron execution.
 */
export async function triggerWorkerTickAction(
  batchSize = 10,
): Promise<ActionResult<WorkerRunResult>> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "lead:view",
  });
  if (!authResult.authorized) {
    return {
      success: false,
      error: authResult.statusCode === 401 ? "Unauthorized" : authResult.error,
    };
  }

  const supabase = await createServerSupabaseClient();
  if (
    !supabase ||
    authResult.context.workspace.id === DEMO_WORKSPACE_CONTEXT.workspace.id
  ) {
    const result = await runOutboxWorkerTick({
      batchSize,
    });
    revalidatePath("/dashboard");
    return { success: true, data: result };
  }

  const result = await runOutboxWorkerTick({
    batchSize,
    supabaseClient: supabase,
  });

  revalidatePath("/dashboard");
  return { success: true, data: result };
}
