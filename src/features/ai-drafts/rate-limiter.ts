/**
 * In-memory sliding window rate limiter for expensive AI drafting actions.
 * Enforces max 10 requests per user per minute.
 */

interface RateLimitRecord {
  timestamps: number[];
}

const userRequestMap = new Map<string, RateLimitRecord>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

/**
 * Checks whether the user has exceeded their drafting rate limit.
 */
export function checkDraftRateLimit(userId: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const record = userRequestMap.get(userId) || { timestamps: [] };

  // Filter out timestamps outside the sliding 60s window
  const validTimestamps = record.timestamps.filter(
    (ts) => now - ts < WINDOW_MS,
  );

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldest = validTimestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  // Record this request
  validTimestamps.push(now);
  userRequestMap.set(userId, { timestamps: validTimestamps });

  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - validTimestamps.length,
  };
}

/**
 * Reset helper for testing environments.
 */
export function resetDraftRateLimiter(): void {
  userRequestMap.clear();
}
