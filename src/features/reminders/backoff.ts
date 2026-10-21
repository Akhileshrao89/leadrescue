export interface BackoffOptions {
  baseSeconds?: number;
  maxSeconds?: number;
  enableJitter?: boolean;
}

const DEFAULT_BASE_SECONDS = 30;
const DEFAULT_MAX_SECONDS = 3600; // 1 hour cap

/**
 * Computes exponential backoff with optional 20% jitter.
 * Formula: min(baseSeconds * (2 ^ attempt), maxSeconds) + jitter
 *
 * Example (base=30s):
 * Attempt 0 -> ~30s
 * Attempt 1 -> ~60s
 * Attempt 2 -> ~120s
 * Attempt 3 -> ~240s
 * Attempt 4 -> ~480s
 */
export function computeExponentialBackoffSeconds(
  attempt: number,
  options: BackoffOptions = {},
): number {
  const baseSeconds = options.baseSeconds ?? DEFAULT_BASE_SECONDS;
  const maxSeconds = options.maxSeconds ?? DEFAULT_MAX_SECONDS;
  const enableJitter = options.enableJitter ?? true;

  const exponential = Math.min(
    baseSeconds * Math.pow(2, Math.max(0, attempt)),
    maxSeconds,
  );

  if (!enableJitter) {
    return Math.round(exponential);
  }

  // Jitter between 0% and 20% to prevent thundering herd problem
  const jitter = Math.random() * (exponential * 0.2);
  return Math.round(exponential + jitter);
}

/**
 * Returns a UTC Date object representing when the next retry should occur.
 */
export function calculateNextAvailableAt(
  attempt: number,
  options: BackoffOptions = {},
): Date {
  const backoffSeconds = computeExponentialBackoffSeconds(attempt, options);
  return new Date(Date.now() + backoffSeconds * 1000);
}
