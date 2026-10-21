import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchWorkspaceLeads,
  updateLeadStageAction,
  completeFollowUpAction,
  deleteLeadAction,
  createLeadAction,
} from "@/features/leads/actions";
import {
  updateWorkspaceSettingsAction,
  deleteWorkspaceAction,
} from "@/features/workspaces/actions";

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

describe("Phase 4: Multi-Tenant Isolation & Cross-Tenant Security Matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const tenantAlphaContext = {
    user: { id: "user-alice", email: "alice@alpha-agency.com" },
    workspace: {
      id: "ws-alpha",
      name: "Alpha Agency",
      slug: "alpha-agency",
      timezone: "America/New_York",
    },
    role: "OWNER" as const,
  };

  const tenantBetaContext = {
    user: { id: "user-charlie", email: "charlie@beta-agency.com" },
    workspace: {
      id: "ws-beta",
      name: "Beta Agency",
      slug: "beta-agency",
      timezone: "Europe/London",
    },
    role: "OWNER" as const,
  };

  describe("Cross-Tenant Read Isolation", () => {
    it("ensures User Charlie (Tenant Beta) only receives leads scoped to ws-beta", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(tenantBetaContext);

      const mockData = [
        {
          id: "lead-beta-1",
          workspace_id: "ws-beta",
          first_name: "Bob",
          stage: "NEW",
          is_archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          version: 1,
        },
      ];

      const mockOrder = vi
        .fn()
        .mockResolvedValue({ data: mockData, error: null });
      const mockEqArchived = vi.fn().mockReturnValue({ order: mockOrder });
      const mockEqWs = vi.fn().mockReturnValue({ eq: mockEqArchived });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqWs });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const result = await fetchWorkspaceLeads({});

      expect(result.leads).toHaveLength(1);
      expect(result.leads[0].id).toBe("lead-beta-1");
      expect(result.leads[0].workspaceId).toBe("ws-beta");

      // Verify the query strictly enforced workspace_id = ws-beta
      expect(mockEqWs).toHaveBeenCalledWith("workspace_id", "ws-beta");
    });
  });

  describe("Cross-Tenant IDOR Mutation Protection", () => {
    it("blocks Charlie (ws-beta) from updating Alice's lead (ws-alpha) by UUID", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(tenantBetaContext);

      // In database, lead-alpha-1 belongs to ws-alpha.
      // Scoped query with .eq("workspace_id", "ws-beta") returns null.
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Row not found" },
      });
      const mockEqWs = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEqId = vi.fn().mockReturnValue({ eq: mockEqWs });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqId });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const res = await updateLeadStageAction("lead-alpha-1", "WON");

      expect(res.success).toBe(false);
      expect(res.error).toBe("Lead not found in active workspace.");
      expect(mockEqWs).toHaveBeenCalledWith("workspace_id", "ws-beta");
    });

    it("blocks Charlie (ws-beta) from completing follow-up on Alice's lead", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(tenantBetaContext);

      const mockEqWs = vi.fn().mockResolvedValue({
        error: { message: "Record does not belong to active workspace" },
      });
      const mockEqId = vi.fn().mockReturnValue({ eq: mockEqWs });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqId });
      const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const res = await completeFollowUpAction(
        "lead-alpha-1",
        "Attempted cross-tenant tamper",
      );

      expect(res.success).toBe(false);
      expect(mockEqWs).toHaveBeenCalledWith("workspace_id", "ws-beta");
    });

    it("blocks Charlie (ws-beta) from deleting Alice's lead (ws-alpha)", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(tenantBetaContext);

      // Lead lookup in ws-beta returns null
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Not found" },
      });
      const mockEqWs = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEqId = vi.fn().mockReturnValue({ eq: mockEqWs });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqId });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const res = await deleteLeadAction("lead-alpha-1");

      expect(res.success).toBe(false);
      expect(res.error).toBe("Lead not found in active workspace.");
      expect(mockEqWs).toHaveBeenCalledWith("workspace_id", "ws-beta");
    });
  });

  describe("Cross-Tenant Workspace Configuration Tamper Protection", () => {
    it("rejects User Charlie attempting to modify Alpha's workspace settings by ID injection", async () => {
      // Charlie has a valid session
      const mockGetUser = vi.fn().mockResolvedValue({
        data: {
          user: {
            id: "user-charlie",
            email: "charlie@beta-agency.com",
            user_metadata: {},
          },
        },
      });

      // But membership query for ws-alpha returns null
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "No membership in ws-alpha" },
      });
      const mockLimit = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEqUser = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEqWs = vi.fn().mockReturnValue({ eq: mockEqUser });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqWs });

      const mockFrom = vi.fn((table: string) => {
        if (table === "memberships") return { select: mockSelect };
        return {};
      });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        auth: { getUser: mockGetUser },
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      // Charlie targets ws-alpha explicitly
      const res = await updateWorkspaceSettingsAction(
        { name: "Hacked Agency", timezone: "UTC" },
        "ws-alpha",
      );

      expect(res.success).toBeFalsy();
      expect(res.error).toContain("You are not a member of this workspace");
    });

    it("rejects User Charlie attempting to delete Alpha's workspace", async () => {
      const mockGetUser = vi.fn().mockResolvedValue({
        data: {
          user: {
            id: "user-charlie",
            email: "charlie@beta-agency.com",
            user_metadata: {},
          },
        },
      });

      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "No membership in ws-alpha" },
      });
      const mockLimit = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEqUser = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEqWs = vi.fn().mockReturnValue({ eq: mockEqUser });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEqWs });

      const mockFrom = vi.fn((table: string) => {
        if (table === "memberships") return { select: mockSelect };
        return {};
      });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        auth: { getUser: mockGetUser },
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const res = await deleteWorkspaceAction("ws-alpha");

      expect(res.success).toBeFalsy();
      expect(res.error).toContain("You are not a member of this workspace");
    });
  });

  describe("Anonymous & Unauthenticated Boundary", () => {
    it("rejects anonymous calls across all mutation and query endpoints", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(null);

      const createRes = await createLeadAction({
        firstName: "Test",
        email: "test@example.com",
        stage: "NEW",
        source: "manual",
      });
      expect(createRes.error).toContain("Unauthorized");

      const updateRes = await updateLeadStageAction("lead-1", "QUALIFIED");
      expect(updateRes.success).toBe(false);

      const deleteRes = await deleteLeadAction("lead-1");
      expect(deleteRes.success).toBe(false);

      const leadsRes = await fetchWorkspaceLeads({});
      expect(leadsRes.leads).toHaveLength(0);
    });
  });

  describe("SQL Injection Resistance in Tenant Filter", () => {
    it("handles injection strings in search without breaking query isolation", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(
        tenantAlphaContext,
      );

      const mockQueryBuilder: Record<string, unknown> = {};
      const mockEq = vi.fn().mockReturnValue(mockQueryBuilder);
      const mockOr = vi.fn().mockReturnValue(mockQueryBuilder);
      const mockOrder = vi.fn().mockReturnValue(mockQueryBuilder);

      mockQueryBuilder.eq = mockEq;
      mockQueryBuilder.or = mockOr;
      mockQueryBuilder.order = mockOrder;
      // When awaited by Next.js / Supabase client
      mockQueryBuilder.then = (
        resolve: (value: { data: unknown[]; error: null }) => void,
      ) => resolve({ data: [], error: null });

      const mockSelect = vi.fn().mockReturnValue(mockQueryBuilder);
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      // Attempt standard SQL injection payloads
      await fetchWorkspaceLeads({ search: "' OR 1=1; --" });

      // Verifies workspace_id scope was not bypassed
      expect(mockEq).toHaveBeenCalledWith("workspace_id", "ws-alpha");
      expect(mockOr).toHaveBeenCalledWith(
        expect.stringContaining("%' OR 1=1; --%"),
      );
    });
  });
});
