import { SupabaseClient } from "@supabase/supabase-js";
import { OutboxEvent, SendReminderPayload } from "./types";
import { sendTransactionalEmail } from "./email-transporter";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Handles processing of a claimed outbox event based on its job_type.
 */
export async function dispatchOutboxJob(
  supabase: SupabaseClient,
  job: OutboxEvent,
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  switch (job.jobType) {
    case "SEND_REMINDER":
      return handleSendReminderJob(supabase, job);
    default:
      return { success: false, error: `Unsupported job type: ${job.jobType}` };
  }
}

async function handleSendReminderJob(
  supabase: SupabaseClient,
  job: OutboxEvent,
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  const payload = job.payload as unknown as SendReminderPayload;
  if (!payload || !payload.reminderId || !payload.leadId) {
    return { success: false, error: "Malformed SEND_REMINDER payload" };
  }

  // 1. Fetch current reminder record to check if it was cancelled
  const { data: reminder, error: reminderErr } = await supabase
    .from("reminders")
    .select("id, status, workspace_id, lead_id, recipient_user_id, due_at")
    .eq("id", payload.reminderId)
    .single();

  if (reminderErr || !reminder) {
    return {
      success: false,
      error: `Reminder not found: ${payload.reminderId}`,
    };
  }

  if (reminder.status === "CANCELLED") {
    return { success: true, skipped: true };
  }

  if (reminder.status === "SENT") {
    return { success: true, skipped: true };
  }

  // 2. Fetch lead to ensure it wasn't closed as WON or LOST in the interim
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select(
      "id, first_name, last_name, company_name, email, stage, is_archived",
    )
    .eq("id", payload.leadId)
    .single();

  if (leadErr || !lead) {
    return { success: false, error: `Lead not found: ${payload.leadId}` };
  }

  if (lead.is_archived || lead.stage === "WON" || lead.stage === "LOST") {
    // Lead is closed/archived: cancel reminder and skip delivery
    await supabase
      .from("reminders")
      .update({
        status: "CANCELLED",
        error_message: `Cancelled: Lead is in terminal stage (${lead.stage}) or archived`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.reminderId);

    return { success: true, skipped: true };
  }

  // 3. Resolve recipient email from profiles
  let recipientEmail = "team@leadrescue.example.com";
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", reminder.recipient_user_id)
    .single();

  if (profile && profile.email) {
    recipientEmail = profile.email;
  }

  const leadFullName = [lead.first_name, lead.last_name]
    .filter(Boolean)
    .join(" ");
  const leadSubject = escapeHtml(leadFullName || "New Lead");
  const companyInfo = lead.company_name
    ? ` (${escapeHtml(lead.company_name)})`
    : "";
  const leadUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/leads/${lead.id}`;

  const emailResult = await sendTransactionalEmail({
    to: recipientEmail,
    subject: `Follow-up Due: ${leadSubject}${companyInfo}`,
    text: `Your follow-up with ${leadSubject} is due today (${new Date(reminder.due_at).toLocaleDateString()}).\n\nView lead and record follow-up: ${leadUrl}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #0f172a;">Follow-Up Due Alert</h2>
        <p style="color: #334155;">You have a scheduled follow-up due for <strong>${leadSubject}</strong>${companyInfo}.</p>
        <div style="margin: 24px 0;">
          <a href="${leadUrl}" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500;">
            Open Lead in LeadRescue
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px;">Scheduled due date: ${new Date(reminder.due_at).toISOString()}</p>
      </div>
    `,
  });

  if (!emailResult.success) {
    // Record error in reminder table
    await supabase
      .from("reminders")
      .update({
        error_message:
          emailResult.error?.slice(0, 500) || "Email delivery failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.reminderId);

    throw new Error(emailResult.error || "Failed to dispatch email");
  }

  const nowISO = new Date().toISOString();

  // 4. Mark reminder as SENT
  await supabase
    .from("reminders")
    .update({
      status: "SENT",
      sent_at: nowISO,
      error_message: null,
      updated_at: nowISO,
    })
    .eq("id", payload.reminderId);

  // 5. Append REMINDER_SENT to lead_activities
  await supabase.from("lead_activities").insert({
    workspace_id: reminder.workspace_id,
    lead_id: lead.id,
    user_id: reminder.recipient_user_id,
    type: "REMINDER_SENT",
    details: {
      reminder_id: reminder.id,
      recipient_email: recipientEmail,
      provider: emailResult.provider,
      message_id: emailResult.messageId,
      dispatched_at: nowISO,
    },
  });

  return { success: true };
}
