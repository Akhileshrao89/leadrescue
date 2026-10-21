import { describe, it, expect, vi } from "vitest";
import { sanitizeForLogging, logger } from "@/lib/security/logger";

describe("Phase 10: Centralized Audit Logger & PII Redaction", () => {
  describe("sanitizeForLogging", () => {
    it("redacts sensitive password and token fields", () => {
      const input = {
        email: "founder@agency.com",
        password: "SuperSecretPassword123!",
        accessToken: "ey1234567890.abcdefg",
        nested: {
          clientSecret: "sk_live_secret",
          webhookSecret: "whsec_abc123",
          normalField: "public_value",
        },
      };

      const sanitized = sanitizeForLogging(input) as Record<string, unknown>;

      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.accessToken).toBe("[REDACTED]");
      expect((sanitized.nested as Record<string, unknown>).clientSecret).toBe(
        "[REDACTED]",
      );
      expect((sanitized.nested as Record<string, unknown>).webhookSecret).toBe(
        "[REDACTED]",
      );
      expect((sanitized.nested as Record<string, unknown>).normalField).toBe(
        "public_value",
      );
    });

    it("redacts service role keys and payment secrets", () => {
      const input = {
        supabase_service_role_key: "eyJhbGciOi...",
        stripe_secret_key: "sk_test_51Mz...",
        cvv: "123",
        creditCard: "4111222233334444",
      };

      const sanitized = sanitizeForLogging(input) as Record<string, unknown>;

      expect(sanitized.supabase_service_role_key).toBe("[REDACTED]");
      expect(sanitized.stripe_secret_key).toBe("[REDACTED]");
      expect(sanitized.cvv).toBe("[REDACTED]");
      expect(sanitized.creditCard).toBe("[REDACTED]");
    });

    it("redacts Bearer token strings", () => {
      const authHeader =
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0";
      expect(sanitizeForLogging(authHeader)).toBe("[REDACTED_TOKEN]");
    });

    it("preserves non-sensitive primitives and arrays", () => {
      const payload = {
        leadCount: 42,
        isArchived: false,
        tags: ["urgent", "hot-lead"],
      };

      const sanitized = sanitizeForLogging(payload) as Record<string, unknown>;
      expect(sanitized.leadCount).toBe(42);
      expect(sanitized.isArchived).toBe(false);
      expect(sanitized.tags).toEqual(["urgent", "hot-lead"]);
    });
  });

  describe("logger.audit", () => {
    it("emits structured audit JSON with redacted details", () => {
      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      logger.audit({
        event: "TEST_SECURITY_EVENT",
        userId: "user-123",
        workspaceId: "ws-456",
        details: {
          secretKey: "very-sensitive",
          allowedInfo: "operation-ok",
        },
      });

      expect(consoleSpy).toHaveBeenCalled();
      const rawLogged = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(rawLogged);

      expect(parsed.level).toBe("audit");
      expect(parsed.event).toBe("TEST_SECURITY_EVENT");
      expect(parsed.userId).toBe("user-123");
      expect(parsed.workspaceId).toBe("ws-456");
      expect(parsed.details.secretKey).toBe("[REDACTED]");
      expect(parsed.details.allowedInfo).toBe("operation-ok");

      consoleSpy.mockRestore();
    });
  });
});
