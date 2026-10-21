import { logger, sanitizeForLogging } from "@/lib/security/logger";
import { AppError } from "./errors";

export interface TelemetryContext {
  userId?: string | null;
  workspaceId?: string | null;
  correlationId?: string | null;
  path?: string | null;
  method?: string | null;
  tags?: Record<string, string | number | boolean>;
  extra?: Record<string, unknown>;
}

export interface CapturedEventResult {
  eventId: string;
  timestamp: string;
  sanitizedMessage: string;
}

/**
 * Generates or extracts a correlation ID for request tracing.
 */
export function getCorrelationId(
  headers?: Headers | Record<string, string | null | undefined>,
): string {
  if (headers) {
    if (typeof (headers as Headers).get === "function") {
      const h = headers as Headers;
      const existing =
        h.get("x-correlation-id") ||
        h.get("x-request-id") ||
        h.get("traceparent");
      if (existing) return existing.trim();
    } else {
      const map = headers as Record<string, string | null | undefined>;
      const existing =
        map["x-correlation-id"] || map["x-request-id"] || map["traceparent"];
      if (existing) return existing.trim();
    }
  }

  // Generate a random UUID-based correlation ID
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `req_${crypto.randomUUID()}`;
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Central telemetry exception capture.
 * Sanitizes sensitive inputs and emits structured error events for Sentry/Datadog/CloudWatch.
 */
export function captureException(
  error: unknown,
  context: TelemetryContext = {},
): CapturedEventResult {
  const eventId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `err_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const timestamp = new Date().toISOString();
  let rawMessage = "Unknown error";
  let stack: string | undefined;
  let errorCode = "INTERNAL_ERROR";
  let isOperational = false;

  if (error instanceof AppError) {
    rawMessage = error.message;
    errorCode = error.code;
    isOperational = error.isOperational;
    stack = error.stack;
  } else if (error instanceof Error) {
    rawMessage = error.message;
    stack = error.stack;
  } else if (typeof error === "string") {
    rawMessage = error;
  }

  // Sanitize message to prevent PII / credential leaks
  const sanitizedMessage = String(sanitizeForLogging(rawMessage));

  const payload = {
    eventId,
    timestamp,
    error: {
      message: sanitizedMessage,
      code: errorCode,
      isOperational,
      // Stack traces only logged internally, not forwarded to untrusted clients
      stack: process.env.NODE_ENV !== "production" ? stack : undefined,
    },
    context: {
      userId: context.userId || null,
      workspaceId: context.workspaceId || null,
      correlationId: context.correlationId || null,
      path: context.path || null,
      method: context.method || null,
      tags: context.tags || {},
      extra: context.extra ? sanitizeForLogging(context.extra) : {},
    },
  };

  logger.error(`[TELEMETRY_EXCEPTION] ${sanitizedMessage}`, payload);

  return {
    eventId,
    timestamp,
    sanitizedMessage,
  };
}

/**
 * Emits an informational or warning telemetry event.
 */
export function captureMessage(
  message: string,
  level: "info" | "warn" = "info",
  context: TelemetryContext = {},
): CapturedEventResult {
  const eventId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const timestamp = new Date().toISOString();
  const sanitizedMessage = String(sanitizeForLogging(message));

  const payload = {
    eventId,
    timestamp,
    message: sanitizedMessage,
    context: {
      userId: context.userId || null,
      workspaceId: context.workspaceId || null,
      correlationId: context.correlationId || null,
      path: context.path || null,
      method: context.method || null,
      tags: context.tags || {},
      extra: context.extra ? sanitizeForLogging(context.extra) : {},
    },
  };

  if (level === "warn") {
    logger.warn(`[TELEMETRY_EVENT] ${sanitizedMessage}`, payload);
  } else {
    logger.info(`[TELEMETRY_EVENT] ${sanitizedMessage}`, payload);
  }

  return {
    eventId,
    timestamp,
    sanitizedMessage,
  };
}
