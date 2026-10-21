import { describe, it, expect, beforeEach } from "vitest";
import {
  checkLeadCreationQuota,
  checkCsvImportQuota,
} from "@/features/billing/quota-guard";
import { SupabaseClient } from "@supabase/supabase-js";
import { tenantCache } from "@/lib/cache/tenant-cache";

interface MockSubRecord {
  tier: string;
  status: string;
  max_active_leads: number;
}

describe("Phase 9: Billing Quota Guard & Tier Limits", () => {
  beforeEach(() => {
    tenantCache.clear();
  });
  function createMockSupabase(
    subscription: MockSubRecord,
    leadCount: number,
  ): SupabaseClient {
    return {
      from: (table: string) => {
        if (table === "subscriptions") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: subscription,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "leads") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  count: leadCount,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      },
    } as unknown as SupabaseClient;
  }

  describe("checkLeadCreationQuota", () => {
    it("allows lead creation when under Free tier quota ceiling (100)", async () => {
      const supabase = createMockSupabase(
        { tier: "FREE", status: "ACTIVE", max_active_leads: 100 },
        42,
      );

      const result = await checkLeadCreationQuota(supabase, "ws-1");
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(42);
      expect(result.maxAllowed).toBe(100);
      expect(result.tier).toBe("FREE");
    });

    it("blocks lead creation when Free tier quota limit is reached", async () => {
      const supabase = createMockSupabase(
        { tier: "FREE", status: "ACTIVE", max_active_leads: 100 },
        100,
      );

      const result = await checkLeadCreationQuota(supabase, "ws-1");
      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(100);
      expect(result.maxAllowed).toBe(100);
      expect(result.error).toContain("maximum limit of 100 active prospects");
      expect(result.error).toContain("upgrade your subscription");
    });

    it("allows lead creation up to 500 on Starter tier", async () => {
      const supabase = createMockSupabase(
        { tier: "STARTER", status: "ACTIVE", max_active_leads: 500 },
        499,
      );

      const result = await checkLeadCreationQuota(supabase, "ws-1");
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(499);
      expect(result.maxAllowed).toBe(500);
    });

    it("enforces read-only mode when subscription status is CANCELLED", async () => {
      const supabase = createMockSupabase(
        { tier: "FREE", status: "CANCELLED", max_active_leads: 100 },
        20,
      );

      const result = await checkLeadCreationQuota(supabase, "ws-1");
      expect(result.allowed).toBe(false);
      expect(result.status).toBe("CANCELLED");
      expect(result.error).toContain("read-only mode");
    });
  });

  describe("checkCsvImportQuota", () => {
    it("allows batch import when within remaining quota capacity", async () => {
      const supabase = createMockSupabase(
        { tier: "STARTER", status: "ACTIVE", max_active_leads: 500 },
        400,
      );

      // 400 + 80 = 480 <= 500
      const result = await checkCsvImportQuota(supabase, "ws-1", 80);
      expect(result.allowed).toBe(true);
    });

    it("blocks batch import when incoming rows exceed remaining quota capacity", async () => {
      const supabase = createMockSupabase(
        { tier: "FREE", status: "ACTIVE", max_active_leads: 100 },
        90,
      );

      // 90 + 20 = 110 > 100
      const result = await checkCsvImportQuota(supabase, "ws-1", 20);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("Import exceeds plan capacity");
      expect(result.error).toContain("only has 10 prospect slots remaining");
    });
  });
});
