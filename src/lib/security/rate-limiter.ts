import { NextRequest } from "next/server";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds?: number;
}

interface WindowRecord {
  timestamps: number[];
  expiresAt: number;
}

// In-memory sliding window store
const rateLimitStore = new Map<string, WindowRecord>();

/**
 * Checks and updates rate limits using a precise sliding-window counter.
 *
 * @param key Unique identifier (e.g. `ip:192.168.1.1` or `ws:workspace-id:user-id`)
 * @param limit Maximum requests permitted in the window
 * @param windowSeconds Window length in seconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const cutoff = now - windowMs;

  let record = rateLimitStore.get(key);

  if (!record || record.expiresAt < now) {
    record = {
      timestamps: [],
      expiresAt: now + windowMs,
    };
  }

  // Filter out timestamps outside the active sliding window
  record.timestamps = record.timestamps.filter((ts) => ts > cutoff);

  const currentCount = record.timestamps.length;
  const remaining = Math.max(0, limit - currentCount);

  if (currentCount >= limit) {
    const oldestTimestamp = record.timestamps[0] || now;
    const retryAfterMs = oldestTimestamp + windowMs - now;
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

    return {
      allowed: false,
      limit,
      remaining: 0,
      resetSeconds: retryAfterSeconds,
      retryAfterSeconds,
    };
  }

  // Record this request
  record.timestamps.push(now);
  record.expiresAt = now + windowMs;
  rateLimitStore.set(key, record);

  // Periodically evict expired entries to prevent memory bloat
  if (rateLimitStore.size > 5000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (v.expiresAt < now) {
        rateLimitStore.delete(k);
      }
    }
  }

  return {
    allowed: true,
    limit,
    remaining: remaining - 1,
    resetSeconds: windowSeconds,
  };
}

/**
 * Extracts the real client IP address from request headers with proxy awareness.
 */
export function getClientIp(request: Request | NextRequest): string {
  const headers = request.headers;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  return "127.0.0.1";
}

/**
 * Clears the in-memory rate limiting store (useful for unit and integration testing).
 */
export function resetRateLimitStore(): void {
  rateLimitStore.clear();
}
