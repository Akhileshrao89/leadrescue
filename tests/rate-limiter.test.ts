import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  getClientIp,
  resetRateLimitStore,
} from "@/lib/security/rate-limiter";

describe("Phase 10: Layered Rate Limiter Engine", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  describe("Sliding Window Rate Limiter", () => {
    it("allows requests up to the specified limit", () => {
      const key = "test:user:1";
      const limit = 5;
      const windowSeconds = 60;

      for (let i = 0; i < limit; i++) {
        const res = checkRateLimit(key, limit, windowSeconds);
        expect(res.allowed).toBe(true);
        expect(res.remaining).toBe(limit - 1 - i);
      }
    });

    it("blocks requests that exceed the specified limit and returns retry-after", () => {
      const key = "test:user:2";
      const limit = 3;
      const windowSeconds = 10;

      // Exhaust limit
      checkRateLimit(key, limit, windowSeconds);
      checkRateLimit(key, limit, windowSeconds);
      checkRateLimit(key, limit, windowSeconds);

      // 4th request must be rejected
      const blocked = checkRateLimit(key, limit, windowSeconds);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.retryAfterSeconds).toBeDefined();
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(10);
    });

    it("isolates rate limits by distinct keys", () => {
      const keyA = "test:ip:192.168.1.1";
      const keyB = "test:ip:10.0.0.1";
      const limit = 2;
      const windowSeconds = 60;

      // Exhaust A
      checkRateLimit(keyA, limit, windowSeconds);
      checkRateLimit(keyA, limit, windowSeconds);
      expect(checkRateLimit(keyA, limit, windowSeconds).allowed).toBe(false);

      // Key B must still be allowed
      expect(checkRateLimit(keyB, limit, windowSeconds).allowed).toBe(true);
    });

    it("resets limits when resetRateLimitStore is called", () => {
      const key = "test:reset";
      checkRateLimit(key, 1, 60);
      expect(checkRateLimit(key, 1, 60).allowed).toBe(false);

      resetRateLimitStore();
      expect(checkRateLimit(key, 1, 60).allowed).toBe(true);
    });
  });

  describe("Client IP Resolution", () => {
    it("extracts the primary IP from x-forwarded-for with multiple proxies", () => {
      const req = new Request("http://localhost:3000/login", {
        headers: {
          "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
        },
      });

      expect(getClientIp(req)).toBe("203.0.113.195");
    });

    it("extracts from x-real-ip when forwarded-for is absent", () => {
      const req = new Request("http://localhost:3000/login", {
        headers: {
          "x-real-ip": "198.51.100.4",
        },
      });

      expect(getClientIp(req)).toBe("198.51.100.4");
    });

    it("extracts from cf-connecting-ip if present", () => {
      const req = new Request("http://localhost:3000/login", {
        headers: {
          "cf-connecting-ip": "192.0.2.1",
        },
      });

      expect(getClientIp(req)).toBe("192.0.2.1");
    });

    it("defaults to 127.0.0.1 when no proxy headers exist", () => {
      const req = new Request("http://localhost:3000/login");
      expect(getClientIp(req)).toBe("127.0.0.1");
    });
  });
});
