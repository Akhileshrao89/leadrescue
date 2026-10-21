import { describe, it, expect, beforeEach } from "vitest";
import { tenantCache } from "@/lib/cache/tenant-cache";

describe("Phase 11: Tenant-Isolated Caching Engine", () => {
  beforeEach(() => {
    tenantCache.clear();
  });

  describe("Cache Key Construction & Isolation Invariants", () => {
    it("builds strictly namespaced tenant cache keys", () => {
      const key = tenantCache.buildKey("ws-agency-1", "leads", "active_count");
      expect(key).toBe("workspace:ws-agency-1:leads:active_count");
    });

    it("throws an error if workspaceId is missing or empty", () => {
      expect(() => tenantCache.buildKey("", "leads", "count")).toThrow(
        "workspaceId is strictly required",
      );
    });

    it("sanitizes special characters in key components", () => {
      const key = tenantCache.buildKey("ws@1!", "meta#", "stats$");
      expect(key).toBe("workspace:ws1:meta:stats");
    });
  });

  describe("Cross-Tenant Isolation", () => {
    it("prevents Tenant B from reading Tenant A's cached entries", () => {
      const wsA = "ws-tenant-alpha";
      const wsB = "ws-tenant-beta";

      tenantCache.set(wsA, "leads", "active_count", 88);

      expect(tenantCache.get(wsA, "leads", "active_count")).toBe(88);
      // Tenant B query on same category and key must return null
      expect(tenantCache.get(wsB, "leads", "active_count")).toBeNull();
    });

    it("invalidates only target workspace cache without affecting other tenants", () => {
      const wsA = "ws-tenant-alpha";
      const wsB = "ws-tenant-beta";

      tenantCache.set(wsA, "leads", "active_count", 40);
      tenantCache.set(wsA, "stats", "today_due", 5);
      tenantCache.set(wsB, "leads", "active_count", 120);

      // Invalidate only Tenant A's leads
      tenantCache.invalidate(wsA, "leads");

      expect(tenantCache.get(wsA, "leads", "active_count")).toBeNull();
      // Tenant A's stats should remain
      expect(tenantCache.get(wsA, "stats", "today_due")).toBe(5);
      // Tenant B's leads should remain intact
      expect(tenantCache.get(wsB, "leads", "active_count")).toBe(120);
    });
  });

  describe("TTL and Expiration", () => {
    it("returns null when cached item has expired", async () => {
      const ws = "ws-expire-test";
      // Set with 0-second TTL (expires immediately)
      tenantCache.set(ws, "temp", "val", "data", -1);

      expect(tenantCache.get(ws, "temp", "val")).toBeNull();
    });

    it("preserves non-expired cached entries", () => {
      const ws = "ws-valid-test";
      tenantCache.set(ws, "temp", "val", { score: 95 }, 60);

      const cached = tenantCache.get<{ score: number }>(ws, "temp", "val");
      expect(cached).toEqual({ score: 95 });
    });
  });
});
