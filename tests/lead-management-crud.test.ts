import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createLeadAction,
  updateLeadAction,
  updateLeadStageAction,
  completeFollowUpAction,
  rescheduleFollowUpAction,
  addLeadNoteAction,
  archiveLeadAction,
  unarchiveLeadAction,
  deleteLeadAction,
  fetchLeadByIdAction,
} from "@/features/leads/actions";

// Mock Supabase, Next.js cache, and Server modules
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/features/workspaces/server", () => ({
  getActiveWorkspaceForUser: vi.fn(),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveWorkspaceForUser } from "@/features/workspaces/server";

describe("Phase 5: Lead Management CRUD & Activity Timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockActiveWorkspace = {
    user: { id: "user-1", email: "agent@agency.com" },
    workspace: {
      id: "ws-1",
      name: "Apex Agency",
      slug: "apex-agency",
      timezone: "America/New_York",
    },
    role: "OWNER" as const,
  };

  describe("createLeadAction", () => {
    it("creates lead and records initial NOTE_ADDED activity", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(
        mockActiveWorkspace,
      );

      const mockLeadInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "lead-new-1" },
            error: null,
          }),
        }),
      });

      const mockActivityInsert = vi.fn().mockResolvedValue({ error: null });

      const mockFrom = vi.fn((table: string) => {
        if (table === "leads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  ilike: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({ data: null }),
                    }),
                  }),
                }),
              }),
            }),
            insert: mockLeadInsert,
          };
        }
        if (table === "lead_activities") {
          return { insert: mockActivityInsert };
        }
        return {};
      });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const res = await createLeadAction({
        firstName: "Jordan",
        lastName: "Lee",
        email: "jordan@company.com",
        phone: "+1 555-0199",
        companyName: "Jordan Retail",
        stage: "NEW",
        source: "outbound",
        notes: "Initial discovery call needed",
      });

      expect(res.success).toBe(true);
      expect(res.leadId).toBe("lead-new-1");

      // Verify activity was inserted
      expect(mockActivityInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: "ws-1",
          lead_id: "lead-new-1",
          type: "NOTE_ADDED",
        }),
      );
    });
  });

  describe("updateLeadAction with optimistic locking", () => {
    it("updates lead fields and increments version", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(
        mockActiveWorkspace,
      );

      const mockCurrentLead = {
        id: "lead-1",
        version: 2,
        email: "lead@example.com",
        notes: "Old notes",
      };

      const mockSingle = vi.fn().mockResolvedValue({
        data: mockCurrentLead,
        error: null,
      });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const mockActivityInsert = vi.fn().mockResolvedValue({ error: null });

      const mockFrom = vi.fn((table: string) => {
        if (table === "leads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: mockSingle,
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        if (table === "lead_activities") {
          return { insert: mockActivityInsert };
        }
        return {};
      });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const res = await updateLeadAction("lead-1", {
        phone: "+1 555-9988",
        notes: "Updated notes after meeting",
        expectedVersion: 2,
      });

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 3, // incremented
          phone: "+1 555-9988",
          notes: "Updated notes after meeting",
        }),
      );

      // Verify note modification logged in activity
      expect(mockActivityInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "NOTE_ADDED",
          details: expect.objectContaining({ action: "Updated notes" }),
        }),
      );
    });

    it("rejects concurrent update with conflict when expectedVersion does not match", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(
        mockActiveWorkspace,
      );

      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: "lead-1", version: 5, email: "lead@example.com" },
        error: null,
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const res = await updateLeadAction("lead-1", {
        phone: "+1 555-0000",
        expectedVersion: 4, // stale version
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Conflict");
    });
  });

  describe("updateLeadStageAction with state machine enforcement", () => {
    it("rejects illegal state jump from NEW to WON", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(
        mockActiveWorkspace,
      );

      const mockSingle = vi.fn().mockResolvedValue({
        data: { stage: "NEW", version: 1 },
        error: null,
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const res = await updateLeadStageAction("lead-1", "WON");

      expect(res.success).toBe(false);
      expect(res.error).toContain(
        "Invalid stage transition from 'NEW' to 'WON'",
      );
    });

    it("accepts valid stage progression from NEW to CONTACTED and logs STAGE_CHANGED", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(
        mockActiveWorkspace,
      );

      const mockSingle = vi.fn().mockResolvedValue({
        data: { stage: "NEW", version: 1 },
        error: null,
      });

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const mockActivityInsert = vi.fn().mockResolvedValue({ error: null });

      const mockFrom = vi.fn((table: string) => {
        if (table === "leads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: mockSingle,
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        if (table === "lead_activities") {
          return { insert: mockActivityInsert };
        }
        return {};
      });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const res = await updateLeadStageAction("lead-1", "CONTACTED");

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: "CONTACTED",
          version: 2,
        }),
      );

      expect(mockActivityInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "STAGE_CHANGED",
          details: { old_stage: "NEW", new_stage: "CONTACTED" },
        }),
      );
    });
  });

  describe("completeFollowUpAction", () => {
    it("updates last_contacted_at, sets next follow-up, and logs FOLLOW_UP_COMPLETED", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(
        mockActiveWorkspace,
      );

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const mockActivityInsert = vi.fn().mockResolvedValue({ error: null });

      const mockFrom = vi.fn((table: string) => {
        if (table === "leads") {
          return { update: mockUpdate };
        }
        if (table === "lead_activities") {
          return { insert: mockActivityInsert };
        }
        return {};
      });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const nextDate = new Date("2026-11-01T10:00:00Z").toISOString();
      const res = await completeFollowUpAction(
        "lead-1",
        "Client agreed to review quote",
        nextDate,
      );

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          next_follow_up_at: nextDate,
          last_contacted_at: expect.any(String),
        }),
      );

      expect(mockActivityInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "FOLLOW_UP_COMPLETED",
          details: expect.objectContaining({
            outcome_note: "Client agreed to review quote",
            next_scheduled_at: nextDate,
          }),
        }),
      );
    });
  });

  describe("rescheduleFollowUpAction", () => {
    it("updates next_follow_up_at and logs FOLLOW_UP_SCHEDULED activity", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(
        mockActiveWorkspace,
      );

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const mockActivityInsert = vi.fn().mockResolvedValue({ error: null });

      const mockFrom = vi.fn((table: string) => {
        if (table === "leads") return { update: mockUpdate };
        if (table === "lead_activities") return { insert: mockActivityInsert };
        return {};
      });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const nextDate = "2026-11-15T14:00:00.000Z";
      const res = await rescheduleFollowUpAction(
        "lead-1",
        nextDate,
        "Prospect requested to connect after conference",
      );

      expect(res.success).toBe(true);
      expect(mockActivityInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "FOLLOW_UP_SCHEDULED",
          details: expect.objectContaining({
            reason: "Prospect requested to connect after conference",
          }),
        }),
      );
    });
  });

  describe("addLeadNoteAction", () => {
    it("logs NOTE_ADDED activity with note content", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(
        mockActiveWorkspace,
      );

      const mockActivityInsert = vi.fn().mockResolvedValue({ error: null });

      const mockFrom = vi.fn().mockReturnValue({
        insert: mockActivityInsert,
      });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const res = await addLeadNoteAction("lead-1", "Met at conference booth");

      expect(res.success).toBe(true);
      expect(mockActivityInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "NOTE_ADDED",
          details: { note: "Met at conference booth" },
        }),
      );
    });
  });

  describe("archiveLeadAction and unarchiveLeadAction", () => {
    it("toggles is_archived state properly", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(
        mockActiveWorkspace,
      );

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const archiveRes = await archiveLeadAction("lead-1");
      expect(archiveRes.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ is_archived: true }),
      );

      const unarchiveRes = await unarchiveLeadAction("lead-1");
      expect(unarchiveRes.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ is_archived: false }),
      );
    });
  });

  describe("fetchLeadByIdAction", () => {
    it("retrieves lead record and ordered activity history", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(
        mockActiveWorkspace,
      );

      const mockLeadData = {
        id: "lead-1",
        workspace_id: "ws-1",
        first_name: "Emma",
        stage: "QUALIFIED",
        is_archived: false,
        version: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockActivities = [
        {
          id: "act-2",
          workspace_id: "ws-1",
          lead_id: "lead-1",
          type: "STAGE_CHANGED",
          details: { old_stage: "CONTACTED", new_stage: "QUALIFIED" },
          created_at: new Date().toISOString(),
        },
        {
          id: "act-1",
          workspace_id: "ws-1",
          lead_id: "lead-1",
          type: "NOTE_ADDED",
          details: { note: "First call" },
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
      ];

      const mockFrom = vi.fn((table: string) => {
        if (table === "leads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi
                    .fn()
                    .mockResolvedValue({ data: mockLeadData, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "lead_activities") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi
                    .fn()
                    .mockResolvedValue({ data: mockActivities, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const res = await fetchLeadByIdAction("lead-1");

      expect(res.lead).toBeDefined();
      expect(res.lead?.firstName).toBe("Emma");
      expect(res.activities).toHaveLength(2);
      expect(res.activities[0].type).toBe("STAGE_CHANGED");
      expect(res.activities[1].type).toBe("NOTE_ADDED");
    });
  });

  describe("deleteLeadAction", () => {
    it("deletes lead when caller has OWNER or ADMIN role", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(
        mockActiveWorkspace,
      );

      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: "lead-1" },
        error: null,
      });

      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
        delete: mockDelete,
      });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const res = await deleteLeadAction("lead-1");
      expect(res.success).toBe(true);
    });
  });
});
