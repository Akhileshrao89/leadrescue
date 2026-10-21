import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  updateLeadStageAction,
  completeFollowUpAction,
} from "@/features/leads/actions";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/features/workspaces/server", () => ({
  getActiveWorkspaceForUser: vi.fn(),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveWorkspaceForUser } from "@/features/workspaces/server";

describe("Multi-Tenancy & Cross-Tenant Isolation Guarantees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prohibits user from updating a lead belonging to another workspace", async () => {
    // User belongs to Workspace A
    vi.mocked(getActiveWorkspaceForUser).mockResolvedValue({
      user: { id: "user-tenant-a", email: "alice@agency-a.com" },
      workspace: {
        id: "ws-tenant-a",
        name: "Agency A",
        slug: "agency-a",
        timezone: "UTC",
      },
      role: "MEMBER",
    });

    // Lead belongs to Workspace B, so single() query scoped to Workspace A returns null
    const mockSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "Row not found" } });
    const mockEqWs = vi.fn().mockReturnValue({ single: mockSingle });
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqWs });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqId });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: mockFrom,
    } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

    // Attempt to mutate User B's lead UUID
    const res = await updateLeadStageAction("lead-of-tenant-b", "WON");

    expect(res.success).toBe(false);
    expect(res.error).toBe("Lead not found in active workspace.");

    // Verify database query was explicitly scoped to Workspace A
    expect(mockEqWs).toHaveBeenCalledWith("workspace_id", "ws-tenant-a");
  });

  it("prohibits completing follow-up for a lead in another workspace", async () => {
    vi.mocked(getActiveWorkspaceForUser).mockResolvedValue({
      user: { id: "user-tenant-a", email: "alice@agency-a.com" },
      workspace: {
        id: "ws-tenant-a",
        name: "Agency A",
        slug: "agency-a",
        timezone: "UTC",
      },
      role: "MEMBER",
    });

    const mockEqWs = vi
      .fn()
      .mockResolvedValue({ error: { message: "Zero rows updated" } });
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqWs });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqId });
    const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: mockFrom,
    } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

    const res = await completeFollowUpAction(
      "lead-of-tenant-b",
      "Attempted cross-tenant write",
    );

    expect(res.success).toBe(false);
    expect(mockEqWs).toHaveBeenCalledWith("workspace_id", "ws-tenant-a");
  });
});
