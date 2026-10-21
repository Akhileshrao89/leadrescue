import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  clampPageSize,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/features/leads/pagination";

describe("Phase 11: Keyset Cursor Pagination & Scaled Data Access", () => {
  describe("Cursor Encoding and Decoding", () => {
    it("encodes and decodes valid keyset cursor payload accurately", () => {
      const payload = {
        sortValue: "2026-10-25T14:00:00.000Z",
        id: "lead-uuid-12345",
        direction: "asc" as const,
      };

      const encoded = encodeCursor(payload);
      expect(typeof encoded).toBe("string");
      expect(encoded.length).toBeGreaterThan(0);
      // Ensure cursor is URL-safe base64url (no '+' or '/' or '=')
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");

      const decoded = decodeCursor(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded?.sortValue).toBe(payload.sortValue);
      expect(decoded?.id).toBe(payload.id);
      expect(decoded?.direction).toBe("asc");
    });

    it("handles null sortValue (e.g. unscheduled leads)", () => {
      const payload = {
        sortValue: null,
        id: "lead-unscheduled-99",
      };

      const encoded = encodeCursor(payload);
      const decoded = decodeCursor(encoded);

      expect(decoded).not.toBeNull();
      expect(decoded?.sortValue).toBeNull();
      expect(decoded?.id).toBe("lead-unscheduled-99");
      expect(decoded?.direction).toBe("asc");
    });

    it("gracefully returns null for invalid or corrupted cursors", () => {
      expect(decodeCursor(null)).toBeNull();
      expect(decodeCursor("")).toBeNull();
      expect(decodeCursor("not-a-valid-base64-string!@#$")).toBeNull();
      expect(
        decodeCursor(Buffer.from("invalid-json").toString("base64url")),
      ).toBeNull();
      expect(
        decodeCursor(
          Buffer.from(JSON.stringify({ wrong: "data" })).toString("base64url"),
        ),
      ).toBeNull();
    });
  });

  describe("Page Size Clamping & Resource Ceilings", () => {
    it("applies default page size when omitted or invalid", () => {
      expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
      expect(clampPageSize(null)).toBe(DEFAULT_PAGE_SIZE);
      expect(clampPageSize(NaN)).toBe(DEFAULT_PAGE_SIZE);
      expect(clampPageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    });

    it("enforces maximum page size limit (100) against resource exhaustion", () => {
      expect(clampPageSize(10000)).toBe(MAX_PAGE_SIZE);
      expect(clampPageSize(101)).toBe(MAX_PAGE_SIZE);
      expect(clampPageSize(50)).toBe(50);
      expect(clampPageSize(25)).toBe(25);
    });

    it("enforces minimum page size (1)", () => {
      expect(clampPageSize(-5)).toBe(1);
    });
  });

  describe("Keyset Pagination Determinism Simulation", () => {
    interface SimulatedLead {
      id: string;
      nextFollowUpAt: string;
    }

    // Generate 120 simulated leads with identical timestamps to test tie-breaker determinism
    const dataset: SimulatedLead[] = Array.from({ length: 120 }, (_, i) => ({
      id: `lead-${String(i + 1).padStart(3, "0")}`,
      nextFollowUpAt: new Date(
        1700000000000 + Math.floor(i / 10) * 86400000,
      ).toISOString(),
    }));

    function paginateDataset(
      cursor: string | null,
      pageSize: number,
    ): { items: SimulatedLead[]; nextCursor: string | null; hasMore: boolean } {
      let filtered = [...dataset];

      const decoded = decodeCursor(cursor);
      if (decoded) {
        filtered = filtered.filter((item) => {
          if (item.nextFollowUpAt > decoded.sortValue!) return true;
          if (item.nextFollowUpAt === decoded.sortValue && item.id > decoded.id)
            return true;
          return false;
        });
      }

      const hasMore = filtered.length > pageSize;
      const items = hasMore ? filtered.slice(0, pageSize) : filtered;

      let nextCursor: string | null = null;
      if (hasMore && items.length > 0) {
        const last = items[items.length - 1];
        nextCursor = encodeCursor({
          sortValue: last.nextFollowUpAt,
          id: last.id,
        });
      }

      return { items, nextCursor, hasMore };
    }

    it("traverses entire dataset with zero duplicate and zero omitted records across page boundaries", () => {
      const pageSize = 25;
      const collected: SimulatedLead[] = [];
      let cursor: string | null = null;
      let pages = 0;

      do {
        const res = paginateDataset(cursor, pageSize);
        collected.push(...res.items);
        cursor = res.nextCursor;
        pages++;
      } while (cursor !== null && pages < 10);

      expect(collected.length).toBe(dataset.length);
      const seenIds = new Set(collected.map((l) => l.id));
      expect(seenIds.size).toBe(dataset.length);
    });
  });
});
