"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifyWorkspaceMembership } from "@/features/workspaces/rbac";
import {
  LeadFormSchema,
  type LeadFormValues,
  UpdateLeadSchema,
  type UpdateLeadValues,
  RescheduleFollowUpSchema,
  AddNoteSchema,
} from "./schema";
import { Lead, LeadActivity, LeadStage, FollowUpQueueType } from "./types";
import { validateStageTransition } from "./state-machine";
import { getWorkspaceTodayBounds } from "./timezone";
import { revalidatePath } from "next/cache";
import {
  scheduleReminderForLead,
  cancelPendingRemindersForLead,
} from "@/features/reminders/manager";
import { checkLeadCreationQuota } from "@/features/billing/quota-guard";
import { checkRateLimit } from "@/lib/security/rate-limiter";
import { logger } from "@/lib/security/logger";
import {
  encodeCursor,
  decodeCursor,
  clampPageSize,
  DEFAULT_PAGE_SIZE,
} from "./pagination";
import { tenantCache } from "@/lib/cache/tenant-cache";
import { demoStore } from "./demo-store";

export type CreateLeadResult = {
  success?: boolean;
  leadId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export type ActionResult = {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

interface LeadDbRow {
  id: string;
  workspace_id: string;
  assigned_user_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  website: string | null;
  stage: LeadStage;
  source: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  is_archived: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ActivityDbRow {
  id: string;
  workspace_id: string;
  lead_id: string;
  user_id: string | null;
  type: LeadActivity["type"];
  details: Record<string, unknown>;
  created_at: string;
}

function mapLeadRow(row: LeadDbRow): Lead {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    assignedUserId: row.assigned_user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    companyName: row.company_name,
    website: row.website,
    stage: row.stage as LeadStage,
    source: row.source,
    notes: row.notes,
    lastContactedAt: row.last_contacted_at,
    nextFollowUpAt: row.next_follow_up_at,
    isArchived: row.is_archived,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates a new lead in the active workspace.
 * Validates fields with Zod, checks duplicate email, logs initial activity.
 */
export async function createLeadAction(
  values: LeadFormValues,
): Promise<CreateLeadResult> {
  const validation = LeadFormSchema.safeParse(values);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.issues.forEach((err) => {
      if (err.path[0]) fieldErrors[err.path[0].toString()] = err.message;
    });
    return { error: "Validation failed", fieldErrors };
  }

  const authResult = await verifyWorkspaceMembership({
    requiredAction: "lead:create",
  });
  if (!authResult.authorized) {
    return { error: authResult.error };
  }

  const supabase = await createServerSupabaseClient();
  const { workspace, user } = authResult.context;
  const input = validation.data;

  if (!supabase) {
    // In-memory demo mode fallback
    if (input.email) {
      const existing = demoStore
        .listLeads()
        .leads.find(
          (l) =>
            l.email?.toLowerCase() === input.email!.toLowerCase().trim() &&
            !l.isArchived,
        );
      if (existing) {
        return {
          error: `A lead with email "${input.email}" already exists in this workspace.`,
          fieldErrors: { email: "Email already registered in workspace" },
        };
      }
    }

    const newLead = demoStore.addLead({
      workspaceId: workspace.id,
      assignedUserId: user.id,
      firstName: input.firstName,
      lastName: input.lastName || null,
      email: input.email ? input.email.toLowerCase().trim() : null,
      phone: input.phone ? input.phone.trim() : null,
      companyName: input.companyName ? input.companyName.trim() : null,
      website: input.website ? input.website.trim() : null,
      stage: input.stage,
      source: input.source || "manual",
      notes: input.notes || null,
      nextFollowUpAt: input.nextFollowUpAt
        ? new Date(input.nextFollowUpAt).toISOString()
        : null,
    });

    demoStore.addActivity({
      workspaceId: workspace.id,
      leadId: newLead.id,
      userId: user.id,
      type: "NOTE_ADDED",
      details: {
        stage: input.stage,
        initial_note: input.notes || null,
      },
    });

    if (input.nextFollowUpAt) {
      demoStore.scheduleReminder({
        workspaceId: workspace.id,
        leadId: newLead.id,
        recipientUserId: user.id,
        dueAt: new Date(input.nextFollowUpAt).toISOString(),
        leadName: [newLead.firstName, newLead.lastName]
          .filter(Boolean)
          .join(" "),
        leadEmail: newLead.email || undefined,
        companyName: newLead.companyName || undefined,
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/leads");

    return { success: true, leadId: newLead.id };
  }

  // Enforce authenticated workspace action rate limit (120 req/min)
  const rateCheck = checkRateLimit(
    `ws_action:${workspace.id}:${user.id}`,
    120,
    60,
  );
  if (!rateCheck.allowed) {
    return {
      error: "Action rate limit exceeded (120 req/min). Please slow down.",
    };
  }

  // Enforce tier lead creation quota and cancelled read-only status
  const quotaCheck = await checkLeadCreationQuota(supabase, workspace.id);
  if (!quotaCheck.allowed) {
    return { error: quotaCheck.error || "Plan lead quota limit reached." };
  }

  // Check duplicate active lead email in this workspace
  if (input.email) {
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("is_archived", false)
      .ilike("email", input.email.trim())
      .limit(1)
      .single();

    if (existingLead) {
      return {
        error: `A lead with email "${input.email}" already exists in this workspace.`,
        fieldErrors: { email: "Email already registered in workspace" },
      };
    }
  }

  // Insert lead
  const { data: newLead, error: insertError } = await supabase
    .from("leads")
    .insert({
      workspace_id: workspace.id,
      first_name: input.firstName,
      last_name: input.lastName || null,
      email: input.email ? input.email.toLowerCase().trim() : null,
      phone: input.phone ? input.phone.trim() : null,
      company_name: input.companyName ? input.companyName.trim() : null,
      website: input.website ? input.website.trim() : null,
      stage: input.stage,
      source: input.source || "manual",
      notes: input.notes || null,
      next_follow_up_at: input.nextFollowUpAt
        ? new Date(input.nextFollowUpAt).toISOString()
        : null,
      assigned_user_id: user.id,
    })
    .select("id")
    .single();

  if (insertError || !newLead) {
    console.error("Failed to insert lead:", insertError);
    return { error: insertError?.message || "Failed to save lead record." };
  }

  // Insert initial activity record
  await supabase.from("lead_activities").insert({
    workspace_id: workspace.id,
    lead_id: newLead.id,
    user_id: user.id,
    type: "NOTE_ADDED",
    details: {
      action: "Created lead",
      initial_stage: input.stage,
      notes_snippet: input.notes ? input.notes.slice(0, 100) : null,
    },
  });

  // Schedule reminder notification if follow-up date was specified
  if (input.nextFollowUpAt) {
    try {
      await scheduleReminderForLead(supabase, {
        workspaceId: workspace.id,
        leadId: newLead.id,
        recipientUserId: user.id,
        dueAt: input.nextFollowUpAt,
        leadName: [input.firstName, input.lastName].filter(Boolean).join(" "),
        leadEmail: input.email ? input.email.trim() : undefined,
        companyName: input.companyName ? input.companyName.trim() : undefined,
      });
    } catch (reminderErr) {
      console.warn("Could not schedule initial reminder:", reminderErr);
    }
  }

  logger.audit({
    event: "LEAD_CREATED",
    workspaceId: workspace.id,
    userId: user.id,
    details: { leadId: newLead.id, stage: input.stage },
  });

  tenantCache.invalidate(workspace.id, "leads");

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");

  return { success: true, leadId: newLead.id };
}

/**
 * Updates a lead's general information with optimistic concurrency control.
 */
export async function updateLeadAction(
  leadId: string,
  values: UpdateLeadValues,
): Promise<ActionResult> {
  const validation = UpdateLeadSchema.safeParse(values);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.issues.forEach((err) => {
      if (err.path[0]) fieldErrors[err.path[0].toString()] = err.message;
    });
    return { success: false, error: "Validation failed", fieldErrors };
  }

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
  const data = validation.data;

  if (!supabase) {
    const existing = demoStore.getLead(leadId);
    if (!existing) {
      return { success: false, error: "Lead not found or inaccessible." };
    }

    demoStore.updateLead(leadId, {
      firstName: data.firstName ?? existing.firstName,
      lastName: data.lastName !== undefined ? data.lastName : existing.lastName,
      email:
        data.email !== undefined
          ? data.email
            ? data.email.toLowerCase().trim()
            : null
          : existing.email,
      phone: data.phone !== undefined ? data.phone : existing.phone,
      companyName:
        data.companyName !== undefined
          ? data.companyName
          : existing.companyName,
      website: data.website !== undefined ? data.website : existing.website,
      source: data.source !== undefined ? data.source : existing.source,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      nextFollowUpAt:
        data.nextFollowUpAt !== undefined
          ? data.nextFollowUpAt
            ? new Date(data.nextFollowUpAt).toISOString()
            : null
          : existing.nextFollowUpAt,
    });

    demoStore.addActivity({
      workspaceId: workspace.id,
      leadId,
      userId: user.id,
      type: "STAGE_CHANGED",
      details: { action: "Lead updated in demo mode", updates: data },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/leads");
    revalidatePath(`/dashboard/leads/${leadId}`);

    return { success: true };
  }

  // Retrieve current lead
  const { data: currentLead, error: fetchError } = await supabase
    .from("leads")
    .select("id, version, email, notes, first_name, last_name, company_name")
    .eq("id", leadId)
    .eq("workspace_id", workspace.id)
    .single();

  if (fetchError || !currentLead) {
    return { success: false, error: "Lead not found in active workspace." };
  }

  // Optimistic concurrency check
  if (
    data.expectedVersion !== undefined &&
    currentLead.version !== data.expectedVersion
  ) {
    return {
      success: false,
      error:
        "Conflict: This lead was modified by another team member. Please refresh.",
    };
  }

  // Check unique email if changed
  if (data.email && data.email.toLowerCase() !== currentLead.email) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspace.id)
      .eq("is_archived", false)
      .ilike("email", data.email.trim())
      .neq("id", leadId)
      .limit(1)
      .single();

    if (existing) {
      return {
        success: false,
        error: `A lead with email "${data.email}" already exists.`,
      };
    }
  }

  const updatePayload: Record<string, unknown> = {
    version: currentLead.version + 1,
    updated_at: new Date().toISOString(),
  };

  if (data.firstName !== undefined) updatePayload.first_name = data.firstName;
  if (data.lastName !== undefined) updatePayload.last_name = data.lastName;
  if (data.email !== undefined)
    updatePayload.email = data.email ? data.email.toLowerCase().trim() : null;
  if (data.phone !== undefined) updatePayload.phone = data.phone;
  if (data.companyName !== undefined)
    updatePayload.company_name = data.companyName;
  if (data.website !== undefined) updatePayload.website = data.website;
  if (data.source !== undefined) updatePayload.source = data.source;
  if (data.notes !== undefined) updatePayload.notes = data.notes;
  if (data.nextFollowUpAt !== undefined) {
    updatePayload.next_follow_up_at = data.nextFollowUpAt
      ? new Date(data.nextFollowUpAt).toISOString()
      : null;
  }
  if (data.assignedUserId !== undefined)
    updatePayload.assigned_user_id = data.assignedUserId;

  const { error: updateError } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", leadId)
    .eq("workspace_id", workspace.id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // If notes were modified, append an activity record
  if (data.notes !== undefined && data.notes !== currentLead.notes) {
    await supabase.from("lead_activities").insert({
      workspace_id: workspace.id,
      lead_id: leadId,
      user_id: user.id,
      type: "NOTE_ADDED",
      details: {
        action: "Updated notes",
        notes_snippet: data.notes ? data.notes.slice(0, 100) : null,
      },
    });
  }

  // Handle reminder sync if next follow up date changed
  if (data.nextFollowUpAt !== undefined) {
    try {
      await cancelPendingRemindersForLead(
        supabase,
        workspace.id,
        leadId,
        "Follow-up date modified",
      );

      if (data.nextFollowUpAt) {
        const leadName = [
          data.firstName || currentLead.first_name,
          data.lastName || currentLead.last_name,
        ]
          .filter(Boolean)
          .join(" ");

        await scheduleReminderForLead(supabase, {
          workspaceId: workspace.id,
          leadId,
          recipientUserId: user.id,
          dueAt: data.nextFollowUpAt,
          leadName: leadName || undefined,
          leadEmail: data.email || currentLead.email || undefined,
          companyName:
            data.companyName || currentLead.company_name || undefined,
        });
      }
    } catch (reminderErr) {
      console.warn("Could not synchronize reminders:", reminderErr);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${leadId}`);

  return { success: true };
}

/**
 * Updates a lead's pipeline stage and logs the transition in lead_activities.
 * Enforces the Lead Lifecycle State Machine rules and optimistic locking.
 */
export async function updateLeadStageAction(
  leadId: string,
  newStage: LeadStage,
  expectedVersion?: number,
): Promise<{ success: boolean; error?: string }> {
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

  if (!supabase) {
    const existing = demoStore.getLead(leadId);
    if (!existing) {
      return { success: false, error: "Lead not found in active workspace." };
    }

    const transition = validateStageTransition(existing.stage, newStage);
    if (!transition.valid) {
      return { success: false, error: transition.error };
    }

    demoStore.updateLead(leadId, { stage: newStage });
    demoStore.addActivity({
      workspaceId: workspace.id,
      leadId,
      userId: user.id,
      type: "STAGE_CHANGED",
      details: { from_stage: existing.stage, to_stage: newStage },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/leads");
    revalidatePath(`/dashboard/leads/${leadId}`);

    return { success: true };
  }

  // Retrieve current lead
  const { data: currentLead, error: fetchError } = await supabase
    .from("leads")
    .select("stage, version")
    .eq("id", leadId)
    .eq("workspace_id", workspace.id)
    .single();

  if (fetchError || !currentLead) {
    return { success: false, error: "Lead not found in active workspace." };
  }

  // Optimistic concurrency check if version token was supplied
  if (
    expectedVersion !== undefined &&
    currentLead.version !== expectedVersion
  ) {
    return {
      success: false,
      error:
        "Conflict: Lead was modified concurrently. Please refresh the page.",
    };
  }

  const oldStage = currentLead.stage as LeadStage;

  // Validate state machine transition
  const transitionCheck = validateStageTransition(oldStage, newStage);
  if (!transitionCheck.valid) {
    return { success: false, error: transitionCheck.error };
  }

  // Update stage with optimistic increment
  const { error: updateError } = await supabase
    .from("leads")
    .update({
      stage: newStage,
      version: currentLead.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("workspace_id", workspace.id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Log stage change activity
  await supabase.from("lead_activities").insert({
    workspace_id: workspace.id,
    lead_id: leadId,
    user_id: user.id,
    type: "STAGE_CHANGED",
    details: {
      old_stage: oldStage,
      new_stage: newStage,
    },
  });

  // Automatically cancel pending reminders when moving to terminal WON or LOST
  if (newStage === "WON" || newStage === "LOST") {
    try {
      await cancelPendingRemindersForLead(
        supabase,
        workspace.id,
        leadId,
        `Lead transitioned to terminal stage ${newStage}`,
      );
    } catch (cancelErr) {
      console.warn("Could not cancel pending reminders:", cancelErr);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${leadId}`);

  return { success: true };
}

/**
 * Completes a follow-up action: updates last_contacted_at, schedules next follow-up,
 * optionally updates stage, and logs the outcome note in lead_activities.
 */
export async function completeFollowUpAction(
  leadId: string,
  outcomeNote: string,
  nextFollowUpAt?: string | null,
  newStage?: LeadStage,
): Promise<{ success: boolean; error?: string }> {
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

  if (!supabase) {
    const existing = demoStore.getLead(leadId);
    if (!existing) {
      return { success: false, error: "Lead not found in active workspace." };
    }

    if (newStage) {
      const transition = validateStageTransition(existing.stage, newStage);
      if (!transition.valid) {
        return { success: false, error: transition.error };
      }
    }

    const nowISO = new Date().toISOString();
    demoStore.updateLead(leadId, {
      lastContactedAt: nowISO,
      nextFollowUpAt: nextFollowUpAt
        ? new Date(nextFollowUpAt).toISOString()
        : null,
      stage: newStage || existing.stage,
    });

    demoStore.addActivity({
      workspaceId: workspace.id,
      leadId,
      userId: user.id,
      type: "FOLLOW_UP_COMPLETED",
      details: {
        outcome: outcomeNote,
        next_follow_up_at: nextFollowUpAt,
        stage: newStage || existing.stage,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/leads");
    revalidatePath(`/dashboard/leads/${leadId}`);

    return { success: true };
  }
  const nowISO = new Date().toISOString();

  // If new stage is requested, retrieve current stage and validate transition
  if (newStage) {
    const { data: currentLead } = await supabase
      .from("leads")
      .select("stage")
      .eq("id", leadId)
      .eq("workspace_id", workspace.id)
      .single();

    if (currentLead) {
      const transitionCheck = validateStageTransition(
        currentLead.stage as LeadStage,
        newStage,
      );
      if (!transitionCheck.valid) {
        return { success: false, error: transitionCheck.error };
      }
    }
  }

  const updatePayload: Record<string, unknown> = {
    last_contacted_at: nowISO,
    next_follow_up_at: nextFollowUpAt
      ? new Date(nextFollowUpAt).toISOString()
      : null,
    updated_at: nowISO,
  };

  if (newStage) {
    updatePayload.stage = newStage;
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", leadId)
    .eq("workspace_id", workspace.id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Record activity
  await supabase.from("lead_activities").insert({
    workspace_id: workspace.id,
    lead_id: leadId,
    user_id: user.id,
    type: "FOLLOW_UP_COMPLETED",
    details: {
      outcome_note: outcomeNote,
      next_scheduled_at: nextFollowUpAt || null,
      stage_transition: newStage || null,
    },
  });

  // Cancel pending reminders for this lead
  try {
    await cancelPendingRemindersForLead(
      supabase,
      workspace.id,
      leadId,
      "Follow-up completed",
    );

    if (nextFollowUpAt) {
      await scheduleReminderForLead(supabase, {
        workspaceId: workspace.id,
        leadId,
        recipientUserId: user.id,
        dueAt: nextFollowUpAt,
      });
    }
  } catch (reminderErr) {
    console.warn(
      "Could not update reminders in completeFollowUpAction:",
      reminderErr,
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${leadId}`);

  return { success: true };
}

/**
 * Reschedules an upcoming follow-up and logs a FOLLOW_UP_SCHEDULED activity.
 */
export async function rescheduleFollowUpAction(
  leadId: string,
  nextFollowUpAt: string,
  reason?: string,
): Promise<ActionResult> {
  const validation = RescheduleFollowUpSchema.safeParse({
    nextFollowUpAt,
    reason,
  });
  if (!validation.success) {
    return { success: false, error: "Invalid follow-up date." };
  }

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

  if (!supabase) {
    const existing = demoStore.getLead(leadId);
    if (!existing) {
      return { success: false, error: "Lead not found in active workspace." };
    }

    const followUpISO = new Date(nextFollowUpAt).toISOString();
    demoStore.updateLead(leadId, { nextFollowUpAt: followUpISO });
    demoStore.scheduleReminder({
      workspaceId: workspace.id,
      leadId,
      recipientUserId: user.id,
      dueAt: followUpISO,
      leadName: [existing.firstName, existing.lastName]
        .filter(Boolean)
        .join(" "),
      leadEmail: existing.email || undefined,
      companyName: existing.companyName || undefined,
    });

    demoStore.addActivity({
      workspaceId: workspace.id,
      leadId,
      userId: user.id,
      type: "FOLLOW_UP_SCHEDULED",
      details: {
        new_scheduled_at: followUpISO,
        reason: reason || "Rescheduled from dashboard",
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/leads");
    revalidatePath(`/dashboard/leads/${leadId}`);

    return { success: true };
  }
  const followUpISO = new Date(nextFollowUpAt).toISOString();

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      next_follow_up_at: followUpISO,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("workspace_id", workspace.id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  await supabase.from("lead_activities").insert({
    workspace_id: workspace.id,
    lead_id: leadId,
    user_id: user.id,
    type: "FOLLOW_UP_SCHEDULED",
    details: {
      new_scheduled_at: followUpISO,
      reason: reason || "Rescheduled from dashboard",
    },
  });

  // Cancel previous reminders and schedule new one
  try {
    await cancelPendingRemindersForLead(
      supabase,
      workspace.id,
      leadId,
      reason || "Rescheduled follow-up",
    );

    await scheduleReminderForLead(supabase, {
      workspaceId: workspace.id,
      leadId,
      recipientUserId: user.id,
      dueAt: followUpISO,
    });
  } catch (reminderErr) {
    console.warn(
      "Could not synchronize reminders in rescheduleFollowUpAction:",
      reminderErr,
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${leadId}`);

  return { success: true };
}

/**
 * Appends a note activity to a lead's audit trail.
 */
export async function addLeadNoteAction(
  leadId: string,
  note: string,
): Promise<ActionResult> {
  const validation = AddNoteSchema.safeParse({ note });
  if (!validation.success) {
    return { success: false, error: "Note cannot be empty." };
  }

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

  if (!supabase) {
    const existing = demoStore.getLead(leadId);
    if (!existing) {
      return { success: false, error: "Lead not found in active workspace." };
    }

    demoStore.addActivity({
      workspaceId: workspace.id,
      leadId,
      userId: user.id,
      type: "NOTE_ADDED",
      details: {
        note: validation.data.note,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/leads");
    revalidatePath(`/dashboard/leads/${leadId}`);

    return { success: true };
  }

  // Insert into lead_activities
  const { error: insertError } = await supabase.from("lead_activities").insert({
    workspace_id: workspace.id,
    lead_id: leadId,
    user_id: user.id,
    type: "NOTE_ADDED",
    details: {
      note: validation.data.note,
    },
  });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${leadId}`);

  return { success: true };
}

/**
 * Deletes a lead record and all cascade associations.
 * Enforces RBAC: strictly requires ADMIN or OWNER role.
 */
export async function deleteLeadAction(
  leadId: string,
): Promise<{ success: boolean; error?: string }> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "lead:delete",
  });

  if (!authResult.authorized) {
    return {
      success: false,
      error: authResult.error,
    };
  }

  const supabase = await createServerSupabaseClient();
  const { workspace } = authResult.context;

  if (!supabase) {
    const existing = demoStore.getLead(leadId);
    if (!existing) {
      return { success: false, error: "Lead not found in active workspace." };
    }
    demoStore.deleteLead(leadId);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/leads");
    return { success: true };
  }

  // Confirm lead exists and belongs to active workspace
  const { data: existingLead, error: fetchError } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .eq("workspace_id", workspace.id)
    .single();

  if (fetchError || !existingLead) {
    return { success: false, error: "Lead not found in active workspace." };
  }

  const { error: deleteError } = await supabase
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("workspace_id", workspace.id);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  logger.audit({
    event: "LEAD_DELETED",
    workspaceId: workspace.id,
    userId: authResult.context.user.id,
    details: { leadId },
  });

  tenantCache.invalidate(workspace.id, "leads");

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");

  return { success: true };
}

/**
 * Archives a lead record.
 */
export async function archiveLeadAction(
  leadId: string,
): Promise<{ success: boolean; error?: string }> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "lead:archive",
  });

  if (!authResult.authorized) {
    return {
      success: false,
      error: authResult.error,
    };
  }

  const supabase = await createServerSupabaseClient();
  const { workspace } = authResult.context;

  if (!supabase) {
    const existing = demoStore.getLead(leadId);
    if (!existing) {
      return { success: false, error: "Lead not found in active workspace." };
    }
    demoStore.deleteLead(leadId);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/leads");
    return { success: true };
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      is_archived: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("workspace_id", workspace.id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  tenantCache.invalidate(workspace.id, "leads");

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${leadId}`);

  return { success: true };
}

/**
 * Unarchives a previously archived lead.
 */
export async function unarchiveLeadAction(
  leadId: string,
): Promise<{ success: boolean; error?: string }> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "lead:archive",
  });

  if (!authResult.authorized) {
    return {
      success: false,
      error: authResult.error,
    };
  }

  const supabase = await createServerSupabaseClient();
  const { workspace } = authResult.context;

  if (!supabase) {
    const existing = demoStore.getLead(leadId);
    if (!existing) {
      return { success: false, error: "Lead not found in active workspace." };
    }
    existing.isArchived = false;
    existing.updatedAt = new Date().toISOString();
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/leads");
    return { success: true };
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      is_archived: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("workspace_id", workspace.id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  tenantCache.invalidate(workspace.id, "leads");

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${leadId}`);

  return { success: true };
}

/**
 * Fetches a single lead by ID along with its full activity timeline.
 */
export async function fetchLeadByIdAction(leadId: string): Promise<{
  lead: Lead | null;
  activities: LeadActivity[];
  error?: string;
}> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "lead:view",
  });
  if (!authResult.authorized) {
    return { lead: null, activities: [], error: authResult.error };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    const lead = demoStore.getLead(leadId) || null;
    const activities = lead ? demoStore.getActivities(leadId) : [];
    return {
      lead,
      activities,
      error: lead ? undefined : "Lead not found in active workspace.",
    };
  }

  const { workspace } = authResult.context;

  // Fetch lead
  const { data: leadData, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("workspace_id", workspace.id)
    .single();

  if (leadError || !leadData) {
    return {
      lead: null,
      activities: [],
      error: "Lead not found in active workspace.",
    };
  }

  // Fetch lead activities timeline
  const { data: activityRows, error: activityError } = await supabase
    .from("lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });

  if (activityError) {
    console.error("Error fetching lead activities:", activityError);
  }

  const mappedActivities: LeadActivity[] = (
    (activityRows as unknown as ActivityDbRow[]) || []
  ).map((a) => ({
    id: a.id,
    workspaceId: a.workspace_id,
    leadId: a.lead_id,
    userId: a.user_id,
    type: a.type,
    details: a.details || {},
    createdAt: a.created_at,
  }));

  return {
    lead: mapLeadRow(leadData as unknown as LeadDbRow),
    activities: mappedActivities,
  };
}

/**
 * Fetches workspace leads from Supabase with search, stage filters, and queue categorization.
 */
export async function fetchWorkspaceLeads(options: {
  search?: string;
  stage?: LeadStage | "ALL";
  queue?: FollowUpQueueType | "ALL";
}): Promise<{ leads: Lead[]; error?: string }> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "lead:view",
  });
  if (!authResult.authorized) return { leads: [] };

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    const res = demoStore.listLeads({
      search: options.search,
      stage: options.stage,
      queue: options.queue,
      limit: 100,
    });
    return { leads: res.leads };
  }

  const { workspace } = authResult.context;
  let query = supabase
    .from("leads")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  if (options.stage && options.stage !== "ALL") {
    query = query.eq("stage", options.stage);
  }

  if (options.search && options.search.trim().length > 0) {
    const term = `%${options.search.trim()}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},company_name.ilike.${term},email.ilike.${term}`,
    );
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error("Error fetching leads:", error);
    return { leads: [], error: error?.message };
  }

  // Calculate queue category using workspace IANA timezone
  const { startOfTodayUTC, endOfTodayUTC } = getWorkspaceTodayBounds(
    workspace.timezone,
  );

  const mappedLeads: Lead[] = (data as unknown as LeadDbRow[]).map(mapLeadRow);

  // Apply in-memory queue filter if specified
  if (options.queue && options.queue !== "ALL") {
    return {
      leads: mappedLeads.filter((l) => {
        if (!l.nextFollowUpAt) return options.queue === "unscheduled";
        const d = new Date(l.nextFollowUpAt);
        if (options.queue === "overdue") return d < startOfTodayUTC;
        if (options.queue === "due_today")
          return d >= startOfTodayUTC && d <= endOfTodayUTC;
        if (options.queue === "upcoming") return d > endOfTodayUTC;
        return true;
      }),
    };
  }

  return { leads: mappedLeads };
}

export interface FetchLeadsKeysetOptions {
  cursor?: string | null;
  limit?: number;
  search?: string;
  stage?: LeadStage | "ALL";
  queue?: FollowUpQueueType | "ALL";
  sortBy?: "next_follow_up_at" | "created_at";
  sortDirection?: "asc" | "desc";
}

export interface FetchLeadsKeysetResult {
  leads: Lead[];
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
  totalActiveCount?: number;
  error?: string;
}

/**
 * High-performance keyset cursor-paginated lead query.
 * Replaces slow OFFSET queries with composite index seeks:
 * (next_follow_up_at, id) > ($cursor_date, $cursor_id)
 */
export async function fetchWorkspaceLeadsKeyset(
  options: FetchLeadsKeysetOptions = {},
): Promise<FetchLeadsKeysetResult> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "lead:view",
  });
  if (!authResult.authorized) {
    return {
      leads: [],
      nextCursor: null,
      hasMore: false,
      pageSize: DEFAULT_PAGE_SIZE,
      error: authResult.error,
    };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    const demoResult = demoStore.listLeads({
      search: options.search,
      stage: options.stage,
      queue: options.queue,
      cursor: options.cursor,
      limit: options.limit,
      sortBy: options.sortBy,
      sortDirection: options.sortDirection,
    });
    return {
      leads: demoResult.leads,
      nextCursor: demoResult.nextCursor,
      hasMore: demoResult.hasMore,
      pageSize: clampPageSize(options.limit),
      totalActiveCount: demoResult.totalActiveCount,
    };
  }

  const { workspace } = authResult.context;
  const pageSize = clampPageSize(options.limit);
  const sortBy = options.sortBy || "next_follow_up_at";
  const ascending = options.sortDirection !== "desc";

  // Check tenant cache for total active lead count (30-second TTL)
  let totalActiveCount = tenantCache.get<number>(
    workspace.id,
    "leads",
    "active_count",
  );
  if (totalActiveCount === null) {
    try {
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id)
        .eq("is_archived", false);

      totalActiveCount = count ?? 0;
      tenantCache.set(
        workspace.id,
        "leads",
        "active_count",
        totalActiveCount,
        30,
      );
    } catch {
      totalActiveCount = 0;
    }
  }

  let query = supabase
    .from("leads")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("is_archived", false);

  if (options.stage && options.stage !== "ALL") {
    query = query.eq("stage", options.stage);
  }

  if (options.search && options.search.trim().length > 0) {
    const term = `%${options.search.trim()}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},company_name.ilike.${term},email.ilike.${term}`,
    );
  }

  // Keyset cursor seek condition
  const cursorPayload = decodeCursor(options.cursor);
  if (cursorPayload) {
    if (sortBy === "created_at" && cursorPayload.sortValue) {
      if (ascending) {
        query = query.gt("created_at", cursorPayload.sortValue);
      } else {
        query = query.lt("created_at", cursorPayload.sortValue);
      }
    } else if (sortBy === "next_follow_up_at" && cursorPayload.sortValue) {
      if (ascending) {
        query = query.gt("next_follow_up_at", cursorPayload.sortValue);
      } else {
        query = query.lt("next_follow_up_at", cursorPayload.sortValue);
      }
    }
  }

  // Composite order with id tie-breaker and limit + 1
  query = query
    .order(sortBy, { ascending, nullsFirst: false })
    .order("id", { ascending })
    .limit(pageSize + 1);

  const { data, error } = await query;
  if (error || !data) {
    console.error("Error fetching keyset leads:", error);
    return {
      leads: [],
      nextCursor: null,
      hasMore: false,
      pageSize,
      error: error?.message,
    };
  }

  const rawRows = (data as unknown as LeadDbRow[]) || [];
  const hasMore = rawRows.length > pageSize;
  const pageRows = hasMore ? rawRows.slice(0, pageSize) : rawRows;
  const mappedLeads: Lead[] = pageRows.map(mapLeadRow);

  // Compute next cursor from the last record in the current page
  let nextCursor: string | null = null;
  if (hasMore && pageRows.length > 0) {
    const lastItem = pageRows[pageRows.length - 1];
    const sortVal =
      sortBy === "created_at"
        ? lastItem.created_at
        : lastItem.next_follow_up_at;
    nextCursor = encodeCursor({
      sortValue: sortVal,
      id: lastItem.id,
      direction: ascending ? "asc" : "desc",
    });
  }

  return {
    leads: mappedLeads,
    nextCursor,
    hasMore,
    pageSize,
    totalActiveCount,
  };
}
