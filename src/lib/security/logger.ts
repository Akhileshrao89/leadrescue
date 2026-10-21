export type LogLevel = "debug" | "info" | "warn" | "error" | "audit";

export interface AuditLogEvent {
  event: string;
  userId?: string | null;
  workspaceId?: string | null;
  ip?: string | null;
  details?: Record<string, unknown>;
  timestamp?: string;
}

const REDACTED_KEYS = new Set([
  "password",
  "newpassword",
  "oldpassword",
  "confirmpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "apisecret",
  "clientsecret",
  "webhooksecret",
  "cookie",
  "authorization",
  "service_role",
  "service_role_key",
  "supabase_service_role_key",
  "stripe_secret_key",
  "stripe-signature",
  "resend_api_key",
  "cvv",
  "creditcard",
  "cardnumber",
]);

/**
 * Recursively redacts sensitive credentials, tokens, and PII from objects, arrays, and strings.
 */
export function sanitizeForLogging(data: unknown, depth = 0): unknown {
  if (depth > 8) return "[MAX_DEPTH_EXCEEDED]";
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    // Check if the string looks like a JWT or Bearer token
    if (
      data.startsWith("Bearer ") ||
      /^ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(data)
    ) {
      return "[REDACTED_TOKEN]";
    }
    return data;
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForLogging(item, depth + 1));
  }

  if (typeof data === "object") {
    const cleanObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "");

      if (
        REDACTED_KEYS.has(lowerKey) ||
        lowerKey.includes("password") ||
        lowerKey.includes("secret")
      ) {
        cleanObj[key] = "[REDACTED]";
      } else {
        cleanObj[key] = sanitizeForLogging(val, depth + 1);
      }
    }
    return cleanObj;
  }

  return String(data);
}

class SecurityLogger {
  private formatLog(level: LogLevel, message: string, meta?: unknown) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta !== undefined ? { context: sanitizeForLogging(meta) } : {}),
    };

    return entry;
  }

  info(message: string, meta?: unknown): void {
    const entry = this.formatLog("info", message, meta);
    console.log(JSON.stringify(entry));
  }

  warn(message: string, meta?: unknown): void {
    const entry = this.formatLog("warn", message, meta);
    console.warn(JSON.stringify(entry));
  }

  error(message: string, meta?: unknown): void {
    const entry = this.formatLog("error", message, meta);
    console.error(JSON.stringify(entry));
  }

  audit(event: AuditLogEvent): void {
    const entry = {
      timestamp: event.timestamp || new Date().toISOString(),
      level: "audit",
      event: event.event,
      userId: event.userId || null,
      workspaceId: event.workspaceId || null,
      ip: event.ip || null,
      details: event.details ? sanitizeForLogging(event.details) : {},
    };

    console.info(JSON.stringify(entry));
  }
}

export const logger = new SecurityLogger();
