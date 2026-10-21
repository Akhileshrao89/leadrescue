import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateFollowUpDraft } from "@/features/ai-drafts/service";
import {
  resetDraftRateLimiter,
  checkDraftRateLimit,
} from "@/features/ai-drafts/rate-limiter";
import { SupabaseClient } from "@supabase/supabase-js";

describe("Phase 8: AI Drafting Service & Quota Enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDraftRateLimiter();
  });

  const mockLead = {
    first_name: "Elena",
    last_name: "Rostova",
    company_name: "Rostova Law Group",
    website: "https://rostovalaw.example",
    notes: "Specializes in corporate law. Wants fresh brand identity.",
    stage: "NEW",
  };

  const mockWorkspace = {
    id: "ws-1",
    name: "Apex Growth Agency",
  };

  const mockProfile = {
    full_name: "David Kim",
  };

  describe("Fast Path (Deterministic Template, useAi: false)", () => {
    it("generates draft instantly without consuming AI quota", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { quota: 20, used: 5, remaining: 15, tier: "FREE" },
        error: null,
      });

      const mockFrom = vi.fn((table: string) => {
        if (table === "leads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi
                    .fn()
                    .mockResolvedValue({ data: mockLead, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "workspaces") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi
                  .fn()
                  .mockResolvedValue({ data: mockWorkspace, error: null }),
              }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi
                  .fn()
                  .mockResolvedValue({ data: mockProfile, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const mockSupabase = {
        from: mockFrom,
        rpc: mockRpc,
      } as unknown as SupabaseClient;

      const res = await generateFollowUpDraft(mockSupabase, {
        workspaceId: "ws-1",
        leadId: "lead-1",
        userId: "user-1",
        touchpointType: "FIRST_TOUCH",
        tone: "FRIENDLY",
        useAi: false,
      });

      expect(res.success).toBe(true);
      expect(res.data?.isAiGenerated).toBe(false);
      expect(res.data?.subject).toContain("Rostova Law Group");
      expect(res.data?.body).toContain("Elena");
      expect(res.data?.body).toContain("Apex Growth Agency");
      expect(res.data?.quotaRemaining).toBe(15);
      expect(res.data?.generationDurationMs).toBeLessThan(50);

      // Verify check_and_consume_ai_quota was NOT called
      expect(mockRpc).not.toHaveBeenCalledWith(
        "check_and_consume_ai_quota",
        expect.anything(),
      );
    });
  });

  describe("AI Path (useAi: true) & Quota Enforcement", () => {
    it("consumes 1 quota unit when generating AI draft", async () => {
      const mockRpc = vi.fn((proc: string) => {
        if (proc === "check_and_consume_ai_quota") {
          return Promise.resolve({
            data: { allowed: true, quota: 20, used: 6, remaining: 14 },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const mockFrom = vi.fn((table: string) => {
        if (table === "leads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi
                    .fn()
                    .mockResolvedValue({ data: mockLead, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "workspaces") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi
                  .fn()
                  .mockResolvedValue({ data: mockWorkspace, error: null }),
              }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi
                  .fn()
                  .mockResolvedValue({ data: mockProfile, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const mockSupabase = {
        from: mockFrom,
        rpc: mockRpc,
      } as unknown as SupabaseClient;

      const res = await generateFollowUpDraft(mockSupabase, {
        workspaceId: "ws-1",
        leadId: "lead-1",
        userId: "user-1",
        touchpointType: "POST_DISCOVERY",
        tone: "PROFESSIONAL",
        useAi: true,
      });

      expect(res.success).toBe(true);
      expect(res.data?.isAiGenerated).toBe(true);
      expect(res.data?.quotaRemaining).toBe(14);
      expect(mockRpc).toHaveBeenCalledWith(
        "check_and_consume_ai_quota",
        expect.objectContaining({ p_workspace_id: "ws-1" }),
      );
    });

    it("blocks AI drafting when monthly quota is exhausted", async () => {
      const mockRpc = vi.fn((proc: string) => {
        if (proc === "check_and_consume_ai_quota") {
          return Promise.resolve({
            data: {
              allowed: false,
              quota: 20,
              used: 20,
              remaining: 0,
              error: "Monthly AI drafting quota exceeded",
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const mockFrom = vi.fn((table: string) => {
        if (table === "leads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi
                    .fn()
                    .mockResolvedValue({ data: mockLead, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "workspaces") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi
                  .fn()
                  .mockResolvedValue({ data: mockWorkspace, error: null }),
              }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi
                  .fn()
                  .mockResolvedValue({ data: mockProfile, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const mockSupabase = {
        from: mockFrom,
        rpc: mockRpc,
      } as unknown as SupabaseClient;

      const res = await generateFollowUpDraft(mockSupabase, {
        workspaceId: "ws-1",
        leadId: "lead-1",
        userId: "user-1",
        touchpointType: "FIRST_TOUCH",
        useAi: true,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Monthly AI drafting quota exceeded");
    });
  });

  describe("Rate Limiter (Max 10 requests / minute)", () => {
    it("allows up to 10 requests within a 1-minute window", () => {
      const userId = "user-frequent";
      for (let i = 0; i < 10; i++) {
        const check = checkDraftRateLimit(userId);
        expect(check.allowed).toBe(true);
        expect(check.remaining).toBe(9 - i);
      }

      // 11th request is blocked
      const blockedCheck = checkDraftRateLimit(userId);
      expect(blockedCheck.allowed).toBe(false);
      expect(blockedCheck.remaining).toBe(0);
      expect(blockedCheck.retryAfterSeconds).toBeGreaterThan(0);
    });
  });
});
