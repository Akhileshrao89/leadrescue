import { describe, it, expect } from "vitest";
import { generateReminderIdempotencyKey } from "@/features/reminders/idempotency";

describe("Phase 7: Reminder Idempotency Key Generation", () => {
  const workspaceId = "ws-550e8400-e29b-41d4-a716-446655440000";
  const leadId = "lead-550e8400-e29b-41d4-a716-446655440001";
  const dueAtIso = "2026-10-25T14:00:00.000Z";

  it("produces deterministic, identical keys for identical inputs", () => {
    const key1 = generateReminderIdempotencyKey(workspaceId, leadId, dueAtIso);
    const key2 = generateReminderIdempotencyKey(workspaceId, leadId, dueAtIso);

    expect(key1).toBe(key2);
    expect(key1.startsWith("rem_")).toBe(true);
  });

  it("produces identical keys whether input is an ISO string or a Date instance", () => {
    const keyFromString = generateReminderIdempotencyKey(
      workspaceId,
      leadId,
      dueAtIso,
    );
    const keyFromDate = generateReminderIdempotencyKey(
      workspaceId,
      leadId,
      new Date(dueAtIso),
    );

    expect(keyFromString).toBe(keyFromDate);
  });

  it("strictly differentiates between different leads and workspaces", () => {
    const key1 = generateReminderIdempotencyKey(workspaceId, leadId, dueAtIso);
    const keyDifferentLead = generateReminderIdempotencyKey(
      workspaceId,
      "lead-different-id",
      dueAtIso,
    );
    const keyDifferentWorkspace = generateReminderIdempotencyKey(
      "ws-different-id",
      leadId,
      dueAtIso,
    );

    expect(key1).not.toBe(keyDifferentLead);
    expect(key1).not.toBe(keyDifferentWorkspace);
    expect(keyDifferentLead).not.toBe(keyDifferentWorkspace);
  });

  it("strictly differentiates between different due dates for the same lead", () => {
    const key1 = generateReminderIdempotencyKey(
      workspaceId,
      leadId,
      "2026-10-25T14:00:00.000Z",
    );
    const key2 = generateReminderIdempotencyKey(
      workspaceId,
      leadId,
      "2026-10-26T14:00:00.000Z",
    );

    expect(key1).not.toBe(key2);
  });

  it("guarantees length fits comfortably within PostgreSQL VARCHAR(100)", () => {
    const key = generateReminderIdempotencyKey(workspaceId, leadId, dueAtIso);
    expect(key.length).toBeLessThanOrEqual(100);
    expect(key.length).toBe(54); // "rem_" (4) + 50 hex chars
  });
});
