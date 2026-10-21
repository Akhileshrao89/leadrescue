import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hasRoleAtLeast,
  hasPermission,
  verifyWorkspaceMembership,
  requireWorkspaceMembership,
  AuthorizationError,
} from "@/features/workspaces/rbac";
import { deleteLeadAction, archiveLeadAction } from "@/features/leads/actions";
import {
  updateWorkspaceSettingsAction,
  deleteWorkspaceAction,
} from "@/features/workspaces/actions";

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

describe("Phase 4: RBAC Role & Permission Matrix", () => {
  describe("Role Hierarchy Check (hasRoleAtLeast)", () => {
    it("correctly evaluates OWNER tier", () => {
      expect(hasRoleAtLeast("OWNER", "OWNER")).toBe(true);
      expect(hasRoleAtLeast("OWNER", "ADMIN")).toBe(true);
      expect(hasRoleAtLeast("OWNER", "MEMBER")).toBe(true);
    });

    it("correctly evaluates ADMIN tier", () => {
      expect(hasRoleAtLeast("ADMIN", "OWNER")).toBe(false);
      expect(hasRoleAtLeast("ADMIN", "ADMIN")).toBe(true);
      expect(hasRoleAtLeast("ADMIN", "MEMBER")).toBe(true);
    });

    it("correctly evaluates MEMBER tier", () => {
      expect(hasRoleAtLeast("MEMBER", "OWNER")).toBe(false);
      expect(hasRoleAtLeast("MEMBER", "ADMIN")).toBe(false);
      expect(hasRoleAtLeast("MEMBER", "MEMBER")).toBe(true);
    });
  });

  describe("Permission Action Check (hasPermission)", () => {
    it("grants OWNER full administrative and destructive capabilities", () => {
      expect(hasPermission("OWNER", "workspace:delete")).toBe(true);
      expect(hasPermission("OWNER", "workspace:update")).toBe(true);
      expect(hasPermission("OWNER", "member:invite")).toBe(true);
      expect(hasPermission("OWNER", "member:remove")).toBe(true);
      expect(hasPermission("OWNER", "lead:delete")).toBe(true);
      expect(hasPermission("OWNER", "lead:archive")).toBe(true);
      expect(hasPermission("OWNER", "billing:manage")).toBe(true);
    });

    it("restricts ADMIN from deleting workspace or managing billing ownership", () => {
      expect(hasPermission("ADMIN", "workspace:delete")).toBe(false);
      expect(hasPermission("ADMIN", "billing:manage")).toBe(false);

      // But can manage leads and invite members
      expect(hasPermission("ADMIN", "workspace:update")).toBe(true);
      expect(hasPermission("ADMIN", "member:invite")).toBe(true);
      expect(hasPermission("ADMIN", "member:remove")).toBe(true);
      expect(hasPermission("ADMIN", "lead:delete")).toBe(true);
      expect(hasPermission("ADMIN", "lead:archive")).toBe(true);
      expect(hasPermission("ADMIN", "lead:create")).toBe(true);
      expect(hasPermission("ADMIN", "lead:update")).toBe(true);
    });

    it("restricts MEMBER from deleting leads, inviting members, or altering settings", () => {
      expect(hasPermission("MEMBER", "lead:delete")).toBe(false);
      expect(hasPermission("MEMBER", "lead:archive")).toBe(false);
      expect(hasPermission("MEMBER", "workspace:update")).toBe(false);
      expect(hasPermission("MEMBER", "workspace:delete")).toBe(false);
      expect(hasPermission("MEMBER", "member:invite")).toBe(false);
      expect(hasPermission("MEMBER", "member:remove")).toBe(false);

      // But can view and work leads
      expect(hasPermission("MEMBER", "lead:view")).toBe(true);
      expect(hasPermission("MEMBER", "lead:create")).toBe(true);
      expect(hasPermission("MEMBER", "lead:update")).toBe(true);
      expect(hasPermission("MEMBER", "activity:create")).toBe(true);
    });
  });
});

describe("Phase 4: Server-Side Membership & RBAC Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated requests with 401", async () => {
    vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(null);

    const result = await verifyWorkspaceMembership({
      requiredAction: "lead:view",
    });

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.statusCode).toBe(401);
      expect(result.error).toContain("Active workspace membership required");
    }
  });

  it("rejects MEMBER with 403 when action requires ADMIN or OWNER", async () => {
    vi.mocked(getActiveWorkspaceForUser).mockResolvedValue({
      user: { id: "user-bob", email: "bob@agency.com" },
      workspace: {
        id: "ws-1",
        name: "Agency Alpha",
        slug: "agency-alpha",
        timezone: "UTC",
      },
      role: "MEMBER",
    });

    const result = await verifyWorkspaceMembership({
      requiredAction: "lead:delete",
    });

    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.statusCode).toBe(403);
      expect(result.error).toContain(
        "does not have permission to execute 'lead:delete'",
      );
    }
  });

  it("authorizes ADMIN for lead:delete", async () => {
    vi.mocked(getActiveWorkspaceForUser).mockResolvedValue({
      user: { id: "user-admin", email: "admin@agency.com" },
      workspace: {
        id: "ws-1",
        name: "Agency Alpha",
        slug: "agency-alpha",
        timezone: "UTC",
      },
      role: "ADMIN",
    });

    const result = await verifyWorkspaceMembership({
      requiredAction: "lead:delete",
    });

    expect(result.authorized).toBe(true);
    if (result.authorized) {
      expect(result.context.role).toBe("ADMIN");
      expect(result.context.workspace.id).toBe("ws-1");
    }
  });

  it("requireWorkspaceMembership throws AuthorizationError when verification fails", async () => {
    vi.mocked(getActiveWorkspaceForUser).mockResolvedValue(null);

    await expect(
      requireWorkspaceMembership({ requiredAction: "lead:view" }),
    ).rejects.toThrowError(AuthorizationError);
  });
});

describe("Phase 4: Action-Level RBAC Enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("MEMBER cannot delete leads via deleteLeadAction", async () => {
    vi.mocked(getActiveWorkspaceForUser).mockResolvedValue({
      user: { id: "user-member", email: "member@agency.com" },
      workspace: {
        id: "ws-1",
        name: "Agency Alpha",
        slug: "agency-alpha",
        timezone: "UTC",
      },
      role: "MEMBER",
    });

    const res = await deleteLeadAction("lead-123");
    expect(res.success).toBe(false);
    expect(res.error).toContain(
      "does not have permission to execute 'lead:delete'",
    );
  });

  it("MEMBER cannot archive leads via archiveLeadAction", async () => {
    vi.mocked(getActiveWorkspaceForUser).mockResolvedValue({
      user: { id: "user-member", email: "member@agency.com" },
      workspace: {
        id: "ws-1",
        name: "Agency Alpha",
        slug: "agency-alpha",
        timezone: "UTC",
      },
      role: "MEMBER",
    });

    const res = await archiveLeadAction("lead-123");
    expect(res.success).toBeFalsy();
    expect(res.error).toContain(
      "does not have permission to execute 'lead:archive'",
    );
  });

  it("ADMIN can delete leads via deleteLeadAction", async () => {
    vi.mocked(getActiveWorkspaceForUser).mockResolvedValue({
      user: { id: "user-admin", email: "admin@agency.com" },
      workspace: {
        id: "ws-1",
        name: "Agency Alpha",
        slug: "agency-alpha",
        timezone: "UTC",
      },
      role: "ADMIN",
    });

    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: "lead-123" },
      error: null,
    });
    const mockEqWs = vi.fn().mockReturnValue({ single: mockSingle });
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqWs });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqId });

    const mockDelEqWs = vi.fn().mockResolvedValue({ error: null });
    const mockDelEqId = vi.fn().mockReturnValue({ eq: mockDelEqWs });
    const mockDelete = vi.fn().mockReturnValue({ eq: mockDelEqId });

    const mockFrom = vi.fn((table: string) => {
      if (table === "leads") {
        return {
          select: mockSelect,
          delete: mockDelete,
        };
      }
      return {};
    });

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: mockFrom,
    } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

    const res = await deleteLeadAction("lead-123");
    expect(res.success).toBe(true);
    expect(mockDelEqWs).toHaveBeenCalledWith("workspace_id", "ws-1");
  });

  it("MEMBER cannot update workspace settings", async () => {
    vi.mocked(getActiveWorkspaceForUser).mockResolvedValue({
      user: { id: "user-member", email: "member@agency.com" },
      workspace: {
        id: "ws-1",
        name: "Agency Alpha",
        slug: "agency-alpha",
        timezone: "UTC",
      },
      role: "MEMBER",
    });

    const res = await updateWorkspaceSettingsAction({
      name: "Renamed Agency",
      timezone: "America/New_York",
    });

    expect(res.success).toBeFalsy();
    expect(res.error).toContain(
      "does not have permission to execute 'workspace:update'",
    );
  });

  it("ADMIN cannot delete workspace (only OWNER)", async () => {
    vi.mocked(getActiveWorkspaceForUser).mockResolvedValue({
      user: { id: "user-admin", email: "admin@agency.com" },
      workspace: {
        id: "ws-1",
        name: "Agency Alpha",
        slug: "agency-alpha",
        timezone: "UTC",
      },
      role: "ADMIN",
    });

    const res = await deleteWorkspaceAction();
    expect(res.success).toBeFalsy();
    expect(res.error).toContain(
      "does not have permission to execute 'workspace:delete'",
    );
  });

  it("OWNER can delete workspace", async () => {
    vi.mocked(getActiveWorkspaceForUser).mockResolvedValue({
      user: { id: "user-owner", email: "owner@agency.com" },
      workspace: {
        id: "ws-1",
        name: "Agency Alpha",
        slug: "agency-alpha",
        timezone: "UTC",
      },
      role: "OWNER",
    });

    const mockEq = vi.fn().mockResolvedValue({ error: null });
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = vi.fn().mockReturnValue({ delete: mockDelete });

    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: mockFrom,
    } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

    const res = await deleteWorkspaceAction();
    expect(res.success).toBe(true);
    expect(mockEq).toHaveBeenCalledWith("id", "ws-1");
  });
});
