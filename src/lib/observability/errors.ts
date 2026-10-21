/**
 * Structured application error classes and normalization utilities.
 * Differentiates expected operational failures (e.g. invalid input, rate limits, quota limits)
 * from unexpected programming defects and internal crashes.
 */

export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "QUOTA_EXCEEDED"
  | "SERVICE_UNAVAILABLE"
  | "DATABASE_ERROR"
  | "INTERNAL_ERROR";

export interface AppErrorOptions {
  code?: ErrorCode;
  statusCode?: number;
  isOperational?: boolean;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details: Record<string, unknown>;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.statusCode = options.statusCode ?? 500;
    this.isOperational = options.isOperational ?? false;
    this.details = options.details ?? {};

    if (options.cause) {
      this.cause = options.cause;
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Validation failed",
    details?: Record<string, unknown>,
  ) {
    super(message, {
      code: "VALIDATION_ERROR",
      statusCode: 400,
      isOperational: true,
      details,
    });
  }
}

export class AuthenticationError extends AppError {
  constructor(
    message = "Authentication required",
    details?: Record<string, unknown>,
  ) {
    super(message, {
      code: "UNAUTHORIZED",
      statusCode: 401,
      isOperational: true,
      details,
    });
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = "Access denied: insufficient permissions",
    details?: Record<string, unknown>,
  ) {
    super(message, {
      code: "FORBIDDEN",
      statusCode: 403,
      isOperational: true,
      details,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource", details?: Record<string, unknown>) {
    super(`${resource} not found`, {
      code: "NOT_FOUND",
      statusCode: 404,
      isOperational: true,
      details,
    });
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "Resource conflict detected",
    details?: Record<string, unknown>,
  ) {
    super(message, {
      code: "CONFLICT",
      statusCode: 409,
      isOperational: true,
      details,
    });
  }
}

export class RateLimitError extends AppError {
  constructor(
    message = "Too many requests. Please slow down.",
    details?: Record<string, unknown>,
  ) {
    super(message, {
      code: "RATE_LIMITED",
      statusCode: 429,
      isOperational: true,
      details,
    });
  }
}

export class QuotaExceededError extends AppError {
  constructor(
    message = "Plan quota limit exceeded. Upgrade to continue.",
    details?: Record<string, unknown>,
  ) {
    super(message, {
      code: "QUOTA_EXCEEDED",
      statusCode: 403,
      isOperational: true,
      details,
    });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(
    message = "Service temporarily unavailable. Please retry shortly.",
    details?: Record<string, unknown>,
  ) {
    super(message, {
      code: "SERVICE_UNAVAILABLE",
      statusCode: 503,
      isOperational: true,
      details,
    });
  }
}

export class DatabaseError extends AppError {
  constructor(message = "Database operation failed", cause?: unknown) {
    super(message, {
      code: "DATABASE_ERROR",
      statusCode: 500,
      isOperational: false,
      cause,
    });
  }
}

/**
 * Checks if an error is an intentional, expected operational error.
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Normalizes an unknown caught error into a safe client-facing payload and HTTP status code.
 * Ensures internal database/system errors never leak implementation details to the client.
 */
export function normalizeErrorResponse(error: unknown): {
  statusCode: number;
  payload: {
    error: {
      message: string;
      code: string;
      details?: Record<string, unknown>;
    };
  };
} {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      payload: {
        error: {
          message: error.message,
          code: error.code,
          ...(Object.keys(error.details).length > 0
            ? { details: error.details }
            : {}),
        },
      },
    };
  }

  // Generic or unhandled errors are treated as 500 Internal Server Error
  return {
    statusCode: 500,
    payload: {
      error: {
        message:
          "An unexpected internal error occurred. Please try again later.",
        code: "INTERNAL_ERROR",
      },
    },
  };
}
