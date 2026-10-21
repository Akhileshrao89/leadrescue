import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  scheduleReminderForLead,
  cancelPendingRemindersForLead,
  fetchWorkspaceReminders,
} from "@/features/reminders/manager";
import { dispatchOutboxJob } from "@/features/reminders/dispatcher";
import {
  getMockEmailTransporterLog,
  clearMockEmailTransporterLog,
} from "@/features/reminders/email-transporter";
import { SupabaseClient } from "@supabase/supabase-js";
import { OutboxEvent } from "@/features/reminders/types";

describe("Phase 7: Reminders Lifecycle, Auto-Cancellation & Dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockEmailTransporterLog();
  });

  describe("scheduleReminderForLead", () => {
    it("creates reminder and enqueues outbox event with deterministic idempotency key", async () => {
      const mockSingleReminder = vi.fn().mockResolvedValue({
        data: { id: "rem-101" },
        error: null,
      });
      const mockInsertReminder = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: mockSingleReminder }),
      });

      const mockSingleOutbox = vi.fn().mockResolvedValue({
        data: { id: "outbox-202" },
        error: null,
      });
      const mockInsertOutbox = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: mockSingleOutbox }),
      });

      const mockFrom = vi.fn((table: string) => {
        if (table === "reminders") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null }), // no duplicate
              }),
            }),
            insert: mockInsertReminder,
          };
        }
        if (table === "outbox_events") {
          return {
            insert: mockInsertOutbox,
          };
        }
        return {};
      });

      const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

      const res = await scheduleReminderForLead(mockSupabase, {
        workspaceId: "ws-1",
        leadId: "lead-1",
        recipientUserId: "user-1",
        dueAt: "2026-10-25T15:00:00.000Z",
        leadName: "Alice Miller",
        companyName: "Acme Web",
      });

      expect(res.success).toBe(true);
      expect(res.reminderId).toBe("rem-101");
      expect(res.alreadyExists).toBe(false);

      expect(mockInsertReminder).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: "ws-1",
          lead_id: "lead-1",
          status: "QUEUED",
          idempotency_key: expect.stringMatching(/^rem_[a-f0-9]{50}$/),
        }),
      );

      expect(mockInsertOutbox).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: "ws-1",
          job_type: "SEND_REMINDER",
          status: "QUEUED",
          payload: expect.objectContaining({
            reminderId: "rem-101",
            leadName: "Alice Miller",
          }),
        }),
      );
    });

    it("prevents duplicate reminders for identical idempotency key", async () => {
      const mockFrom = vi.fn((table: string) => {
        if (table === "reminders") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "rem-existing-1", status: "QUEUED" },
                }),
              }),
            }),
            insert: vi.fn(),
          };
        }
        return {};
      });

      const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

      const res = await scheduleReminderForLead(mockSupabase, {
        workspaceId: "ws-1",
        leadId: "lead-1",
        recipientUserId: "user-1",
        dueAt: "2026-10-25T15:00:00.000Z",
      });

      expect(res.success).toBe(true);
      expect(res.reminderId).toBe("rem-existing-1");
      expect(res.alreadyExists).toBe(true);
    });
  });

  describe("cancelPendingRemindersForLead", () => {
    it("cancels all QUEUED reminders for a lead", async () => {
      const mockSelect = vi
        .fn()
        .mockResolvedValue({ data: [{ id: "rem-1" }, { id: "rem-2" }] });
      const mockEqStatus = vi.fn().mockReturnValue({ select: mockSelect });
      const mockEqLead = vi.fn().mockReturnValue({ eq: mockEqStatus });
      const mockEqWs = vi.fn().mockReturnValue({ eq: mockEqLead });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqWs });

      const mockSupabase = {
        from: vi.fn().mockReturnValue({ update: mockUpdate }),
      } as unknown as SupabaseClient;

      const res = await cancelPendingRemindersForLead(
        mockSupabase,
        "ws-1",
        "lead-1",
        "Lead marked as WON",
      );

      expect(res.success).toBe(true);
      expect(res.cancelledCount).toBe(2);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "CANCELLED",
          error_message: "Lead marked as WON",
        }),
      );
    });
  });

  describe("dispatchOutboxJob execution", () => {
    it("successfully dispatches email, updates reminder to SENT, and appends REMINDER_SENT activity", async () => {
      const mockReminder = {
        id: "rem-active",
        status: "QUEUED",
        workspace_id: "ws-1",
        lead_id: "lead-1",
        recipient_user_id: "user-1",
        due_at: "2026-10-25T12:00:00.000Z",
      };

      const mockLead = {
        id: "lead-1",
        first_name: "Sarah",
        last_name: "Connor",
        company_name: "Cyberdyne Systems",
        email: "sarah@cyberdyne.example",
        stage: "CONTACTED",
        is_archived: false,
      };

      const mockProfile = {
        email: "agent@agency.example",
        full_name: "Agent Smith",
      };

      const mockReminderUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockActivityInsert = vi.fn().mockResolvedValue({ error: null });

      const mockFrom = vi.fn((table: string) => {
        if (table === "reminders") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockReminder,
                  error: null,
                }),
              }),
            }),
            update: mockReminderUpdate,
          };
        }
        if (table === "leads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockLead,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockProfile,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "lead_activities") {
          return {
            insert: mockActivityInsert,
          };
        }
        return {};
      });

      const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

      const job: OutboxEvent = {
        id: "job-1",
        workspaceId: "ws-1",
        jobType: "SEND_REMINDER",
        payload: {
          reminderId: "rem-active",
          leadId: "lead-1",
          workspaceId: "ws-1",
          recipientUserId: "user-1",
          dueAt: "2026-10-25T12:00:00.000Z",
        },
        status: "PROCESSING",
        attempts: 0,
        maxAttempts: 5,
        availableAt: new Date().toISOString(),
        leaseToken: "tok-1",
        leaseExpiresAt: new Date().toISOString(),
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await dispatchOutboxJob(mockSupabase, job);

      expect(res.success).toBe(true);

      // Verify email was dispatched via transporter
      const emailLogs = getMockEmailTransporterLog();
      expect(emailLogs).toHaveLength(1);
      expect(emailLogs[0].to).toBe("agent@agency.example");
      expect(emailLogs[0].subject).toContain("Sarah Connor");
      expect(emailLogs[0].subject).toContain("Cyberdyne Systems");

      // Verify reminder status updated to SENT
      expect(mockReminderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "SENT",
        }),
      );

      // Verify activity was logged
      expect(mockActivityInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: "ws-1",
          lead_id: "lead-1",
          type: "REMINDER_SENT",
          details: expect.objectContaining({
            recipient_email: "agent@agency.example",
          }),
        }),
      );
    });

    it("skips dispatch and cancels reminder if lead was moved to WON or LOST before execution", async () => {
      const mockReminder = {
        id: "rem-active",
        status: "QUEUED",
        workspace_id: "ws-1",
        lead_id: "lead-won",
        recipient_user_id: "user-1",
        due_at: "2026-10-25T12:00:00.000Z",
      };

      const mockLeadWon = {
        id: "lead-won",
        first_name: "Sarah",
        last_name: "Connor",
        company_name: "Cyberdyne Systems",
        stage: "WON", // Terminal stage!
        is_archived: false,
      };

      const mockReminderUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockFrom = vi.fn((table: string) => {
        if (table === "reminders") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockReminder,
                  error: null,
                }),
              }),
            }),
            update: mockReminderUpdate,
          };
        }
        if (table === "leads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockLeadWon,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

      const job: OutboxEvent = {
        id: "job-2",
        workspaceId: "ws-1",
        jobType: "SEND_REMINDER",
        payload: {
          reminderId: "rem-active",
          leadId: "lead-won",
          workspaceId: "ws-1",
          recipientUserId: "user-1",
          dueAt: "2026-10-25T12:00:00.000Z",
        },
        status: "PROCESSING",
        attempts: 0,
        maxAttempts: 5,
        availableAt: new Date().toISOString(),
        leaseToken: "tok-2",
        leaseExpiresAt: new Date().toISOString(),
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await dispatchOutboxJob(mockSupabase, job);

      expect(res.success).toBe(true);
      expect(res.skipped).toBe(true);

      // Verify no email was dispatched
      expect(getMockEmailTransporterLog()).toHaveLength(0);

      // Verify reminder was marked CANCELLED
      expect(mockReminderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "CANCELLED",
        }),
      );
    });
  });

  describe("fetchWorkspaceReminders", () => {
    it("fetches reminders with ordering by due_at", async () => {
      const mockRemindersData = [
        {
          id: "r1",
          workspace_id: "ws-1",
          lead_id: "lead-1",
          recipient_user_id: "u1",
          due_at: "2026-10-25T10:00:00Z",
          status: "QUEUED",
          idempotency_key: "k1",
          sent_at: null,
          error_message: null,
          created_at: "2026-10-20T10:00:00Z",
          updated_at: "2026-10-20T10:00:00Z",
        },
      ];

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: mockRemindersData,
                error: null,
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      const res = await fetchWorkspaceReminders(mockSupabase, "ws-1");

      expect(res.success).toBe(true);
      expect(res.reminders).toHaveLength(1);
      expect(res.reminders[0].id).toBe("r1");
      expect(res.reminders[0].status).toBe("QUEUED");
    });
  });
});
