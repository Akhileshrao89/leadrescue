import { describe, it, expect, vi } from "vitest";
import {
  AppError,
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  QuotaExceededError,
  ServiceUnavailableError,
  DatabaseError,
  isOperationalError,
  normalizeErrorResponse,
} from "@/lib/observability/errors";
import {
  captureException,
  captureMessage,
  getCorrelationId,
} from "@/lib/observability/telemetry";
import { logger } from "@/lib/security/logger";

describe("Phase 12: Observability & Structured Error Handling", () => {
  describe("AppError Hierarchy & Classification", () => {
    it("correctly identifies operational errors vs programming defects", () => {
      const valErr = new ValidationError("Email invalid");
      const authErr = new AuthenticationError();
      const forbidErr = new ForbiddenError();
      const notFoundErr = new NotFoundError("Lead");
      const conflictErr = new ConflictError();
      const rateLimitErr = new RateLimitError();
      const quotaErr = new QuotaExceededError();
      const serviceUnavailable = new ServiceUnavailableError();
      const dbErr = new DatabaseError("Query execution error");
      const genericErr = new Error("Uncaught syntax/runtime bug");

      expect(isOperationalError(valErr)).toBe(true);
      expect(isOperationalError(authErr)).toBe(true);
      expect(isOperationalError(forbidErr)).toBe(true);
      expect(isOperationalError(notFoundErr)).toBe(true);
      expect(isOperationalError(conflictErr)).toBe(true);
      expect(isOperationalError(rateLimitErr)).toBe(true);
      expect(isOperationalError(quotaErr)).toBe(true);
      expect(isOperationalError(serviceUnavailable)).toBe(true);

      // System / unexpected errors should not be marked as operational
      expect(isOperationalError(dbErr)).toBe(false);
      expect(isOperationalError(genericErr)).toBe(false);
      expect(isOperationalError("random string")).toBe(false);
    });

    it("assigns appropriate HTTP status codes and error codes", () => {
      expect(new ValidationError().statusCode).toBe(400);
      expect(new ValidationError().code).toBe("VALIDATION_ERROR");

      expect(new AuthenticationError().statusCode).toBe(401);
      expect(new AuthenticationError().code).toBe("UNAUTHORIZED");

      expect(new ForbiddenError().statusCode).toBe(403);
      expect(new ForbiddenError().code).toBe("FORBIDDEN");

      expect(new NotFoundError("Agency").statusCode).toBe(404);
      expect(new NotFoundError("Agency").code).toBe("NOT_FOUND");
      expect(new NotFoundError("Agency").message).toBe("Agency not found");

      expect(new ConflictError().statusCode).toBe(409);
      expect(new ConflictError().code).toBe("CONFLICT");

      expect(new RateLimitError().statusCode).toBe(429);
      expect(new RateLimitError().code).toBe("RATE_LIMITED");

      expect(new QuotaExceededError().statusCode).toBe(403);
      expect(new QuotaExceededError().code).toBe("QUOTA_EXCEEDED");

      expect(new ServiceUnavailableError().statusCode).toBe(503);
      expect(new ServiceUnavailableError().code).toBe("SERVICE_UNAVAILABLE");

      expect(new DatabaseError().statusCode).toBe(500);
      expect(new DatabaseError().code).toBe("DATABASE_ERROR");
    });

    it("normalizeErrorResponse hides internal details for unknown errors but preserves operational errors", () => {
      const operational = new ValidationError("Invalid phone number", {
        field: "phone",
      });
      const opNorm = normalizeErrorResponse(operational);
      expect(opNorm.statusCode).toBe(400);
      expect(opNorm.payload.error.code).toBe("VALIDATION_ERROR");
      expect(opNorm.payload.error.message).toBe("Invalid phone number");
      expect(opNorm.payload.error.details).toEqual({ field: "phone" });

      const internalErr = new Error(
        "FATAL: connection to server on socket failed",
      );
      const intNorm = normalizeErrorResponse(internalErr);
      expect(intNorm.statusCode).toBe(500);
      expect(intNorm.payload.error.code).toBe("INTERNAL_ERROR");
      expect(intNorm.payload.error.message).toBe(
        "An unexpected internal error occurred. Please try again later.",
      );
      expect(intNorm.payload.error.details).toBeUndefined();
    });
  });

  describe("Correlation Tracing", () => {
    it("extracts correlation ID from standard header keys", () => {
      const headers = new Headers();
      headers.set("x-correlation-id", "corr-12345");
      expect(getCorrelationId(headers)).toBe("corr-12345");

      const reqHeaders = new Headers();
      reqHeaders.set("x-request-id", "req-abcdef");
      expect(getCorrelationId(reqHeaders)).toBe("req-abcdef");

      const mapHeaders = { "x-correlation-id": "map-999" };
      expect(getCorrelationId(mapHeaders)).toBe("map-999");
    });

    it("generates random correlation ID when headers are absent", () => {
      const corrId = getCorrelationId();
      expect(corrId.startsWith("req_")).toBe(true);
      expect(corrId.length).toBeGreaterThan(10);
    });
  });

  describe("Telemetry Exception & Message Capture", () => {
    it("captures exceptions and sanitizes sensitive fields in context", () => {
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

      const err = new AppError("Payment transaction failed", {
        code: "BAD_REQUEST",
        statusCode: 400,
        isOperational: true,
      });

      const res = captureException(err, {
        userId: "usr_1",
        workspaceId: "ws_1",
        correlationId: "corr_test",
        extra: {
          secret_key: "sk_live_verysecret123",
          creditCard: "4111222233334444",
          safeNote: "Invoice #101",
        },
      });

      expect(res.eventId).toBeDefined();
      expect(res.sanitizedMessage).toBe("Payment transaction failed");
      expect(errorSpy).toHaveBeenCalled();

      const loggedMeta = errorSpy.mock.calls[0][1] as Record<string, unknown>;
      const context = loggedMeta.context as Record<string, unknown>;
      const extra = context.extra as Record<string, unknown>;

      expect(extra.secret_key).toBe("[REDACTED]");
      expect(extra.creditCard).toBe("[REDACTED]");
      expect(extra.safeNote).toBe("Invoice #101");

      errorSpy.mockRestore();
    });

    it("captures warning and info messages", () => {
      const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      captureMessage("Worker batch claimed", "info", { workspaceId: "ws-1" });
      expect(infoSpy).toHaveBeenCalled();

      captureMessage("Approaching quota limit", "warn", {
        workspaceId: "ws-1",
      });
      expect(warnSpy).toHaveBeenCalled();

      infoSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});
