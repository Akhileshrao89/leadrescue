import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createLeadAction,
  updateLeadStageAction,
} from "@/features/leads/actions";

// Mock server auth and Supabase
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/features/workspaces/server", () => ({
  getActiveWorkspaceForUser: vi.fn(),
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveWorkspaceForUser } from "@/features/workspaces/server";

describe("Lead Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createLeadAction", () => {
    it("returns error if validation fails (empty name and contacts)", async () => {
      const res = await createLeadAction({
        firstName: "",
        email: "",
        phone: "",
        stage: "NEW",
        source: "manual",
      });

      expect(res.error).toBe("Validation failed");
      expect(res.fieldErrors).toBeDefined();
    });

    it("returns unauthorized if user has no active workspace session", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(null);

      const res = await createLeadAction({
        firstName: "Sarah",
        email: "sarah@example.com",
        stage: "NEW",
        source: "manual",
      });

      expect(res.error).toContain("Unauthorized");
    });

    it("prevents duplicate active leads with same email in workspace", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue({
        user: { id: "user-1", email: "user@agency.com" },
        workspace: {
          id: "ws-1",
          name: "Agency",
          slug: "agency",
          timezone: "UTC",
        },
        role: "OWNER",
      });

      const mockSingle = vi
        .fn()
        .mockResolvedValue({ data: { id: "existing-lead-id" }, error: null });
      const mockLimit = vi.fn().mockReturnValue({ single: mockSingle });
      const mockIlike = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockEq2 = vi.fn().mockReturnValue({ ilike: mockIlike });
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 });
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

      vi.mocked(createServerSupabaseClient).mockResolvedValue({
        from: mockFrom,
      } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

      const res = await createLeadAction({
        firstName: "Sarah",
        email: "duplicate@example.com",
        stage: "NEW",
        source: "manual",
      });

      expect(res.error).toContain("already exists in this workspace");
      expect(res.fieldErrors?.email).toBeDefined();
    });
  });

  describe("updateLeadStageAction", () => {
    it("returns unauthorized if user is not in workspace", async () => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(null);

      const res = await updateLeadStageAction("lead-1", "QUALIFIED");
      expect(res.success).toBe(false);
      expect(res.error).toBe("Unauthorized");
    });
  });
});
