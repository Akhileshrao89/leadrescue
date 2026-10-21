import crypto from "node:crypto";

/**
 * Generates a deterministic, collision-resistant idempotency key for a reminder.
 * Prevents duplicate scheduling of the same reminder for a lead and due date.
 *
 * Pattern: rem_<sha256(workspaceId:leadId:normalizedIsoDate)>
 */
export function generateReminderIdempotencyKey(
  workspaceId: string,
  leadId: string,
  dueAt: string | Date,
): string {
  const normalizedDueAt =
    typeof dueAt === "string"
      ? new Date(dueAt).toISOString()
      : dueAt.toISOString();

  const raw = `${workspaceId.trim()}:${leadId.trim()}:${normalizedDueAt}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  // Output: "rem_" + 50 chars of hex = 54 chars, safely within VARCHAR(100)
  return `rem_${hash.slice(0, 50)}`;
}
