import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSupabaseConfig } from "@/lib/env";
import { applySecurityHeaders } from "@/lib/security/headers";

export interface HealthCheckDatabaseStatus {
  status: "up" | "down" | "unconfigured";
  latencyMs?: number;
  error?: string;
}

export interface HealthCheckOutboxStatus {
  status: "healthy" | "backlog_warning" | "critical_dlq_high" | "unknown";
  queuedCount?: number;
  deadLetterCount?: number;
}

export interface HealthCheckMemoryStatus {
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
}

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  checks: {
    database: HealthCheckDatabaseStatus;
    outbox: HealthCheckOutboxStatus;
    memory: HealthCheckMemoryStatus;
  };
}

export async function performHealthCheck(options?: {
  supabaseClient?: SupabaseClient | null;
}): Promise<{ result: HealthCheckResult; httpStatus: number }> {
  const timestamp = new Date().toISOString();
  const uptimeSeconds =
    typeof process !== "undefined" && typeof process.uptime === "function"
      ? Math.round(process.uptime() * 10) / 10
      : 0;

  const memUsage =
    typeof process !== "undefined" && typeof process.memoryUsage === "function"
      ? process.memoryUsage()
      : { heapUsed: 0, heapTotal: 0, rss: 0 };

  const memory: HealthCheckMemoryStatus = {
    heapUsedMb: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
    heapTotalMb: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
    rssMb: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
  };

  const { isConfigured } = getSupabaseConfig();
  const supabase =
    options?.supabaseClient !== undefined
      ? options.supabaseClient
      : createAdminSupabaseClient();

  let dbStatus: HealthCheckDatabaseStatus;
  let outboxStatus: HealthCheckOutboxStatus = { status: "unknown" };

  if (!supabase) {
    dbStatus = isConfigured
      ? { status: "down", error: "Database client failed to initialize" }
      : { status: "unconfigured" };
  } else {
    const dbStartTime = Date.now();
    try {
      // Lightweight probe query
      const { error: dbErr } = await supabase
        .from("outbox_events")
        .select("id", { count: "exact", head: true })
        .limit(1);

      const dbLatencyMs = Date.now() - dbStartTime;

      if (dbErr) {
        dbStatus = {
          status: "down",
          latencyMs: dbLatencyMs,
          error: dbErr.message,
        };
      } else {
        dbStatus = {
          status: "up",
          latencyMs: dbLatencyMs,
        };

        // If DB is up, gather queue metrics
        try {
          const { count: queuedCount, error: qErr } = await supabase
            .from("outbox_events")
            .select("id", { count: "exact", head: true })
            .eq("status", "QUEUED");

          const { count: dlqCount, error: dlqErr } = await supabase
            .from("outbox_events")
            .select("id", { count: "exact", head: true })
            .eq("status", "DEAD_LETTER");

          if (!qErr && !dlqErr) {
            const q = queuedCount ?? 0;
            const dlq = dlqCount ?? 0;

            let oStatus: HealthCheckOutboxStatus["status"] = "healthy";
            if (dlq > 10) {
              oStatus = "critical_dlq_high";
            } else if (q > 200) {
              oStatus = "backlog_warning";
            }

            outboxStatus = {
              status: oStatus,
              queuedCount: q,
              deadLetterCount: dlq,
            };
          }
        } catch {
          outboxStatus = { status: "unknown" };
        }
      }
    } catch (err) {
      dbStatus = {
        status: "down",
        latencyMs: Date.now() - dbStartTime,
        error:
          err instanceof Error ? err.message : "Database connection refused",
      };
    }
  }

  // Derive overall service health status
  let overallStatus: HealthCheckResult["status"] = "healthy";
  let httpStatus = 200;

  if (dbStatus.status === "down") {
    overallStatus = "unhealthy";
    httpStatus = 503;
  } else if (
    dbStatus.status === "unconfigured" ||
    outboxStatus.status === "backlog_warning" ||
    outboxStatus.status === "critical_dlq_high"
  ) {
    overallStatus = "degraded";
    httpStatus = 200;
  }

  const result: HealthCheckResult = {
    status: overallStatus,
    timestamp,
    uptimeSeconds,
    version: process.env.npm_package_version || "1.0.0",
    checks: {
      database: dbStatus,
      outbox: outboxStatus,
      memory,
    },
  };

  return { result, httpStatus };
}

export async function GET(request?: Request) {
  // If caller provides a valid secret token, return detailed diagnostics.
  // Otherwise, return a public, safe, edge-cached { status: "ok" } with zero DB queries.
  const authHeader = request?.headers?.get("Authorization");
  let tokenParam: string | null = null;
  try {
    if (request?.url) {
      const parsedUrl = new URL(request.url);
      tokenParam = parsedUrl.searchParams.get("token");
    }
  } catch {
    tokenParam = null;
  }

  const expectedSecret =
    process.env.ADMIN_HEALTH_SECRET || process.env.CRON_SECRET;
  const isAuthorized = expectedSecret
    ? authHeader === `Bearer ${expectedSecret}` || tokenParam === expectedSecret
    : false;

  // Unauthenticated public request: return lean response with edge cache, zero database load
  if (request && !isAuthorized) {
    const response = NextResponse.json(
      { status: "ok" },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
        },
      },
    );
    applySecurityHeaders(response.headers);
    return response;
  }

  // Internal / authorized diagnostic health check
  const { result, httpStatus } = await performHealthCheck();

  const response = NextResponse.json(result, {
    status: httpStatus,
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  });

  applySecurityHeaders(response.headers);
  return response;
}

export async function HEAD() {
  const { httpStatus } = await performHealthCheck();
  const response = new NextResponse(null, {
    status: httpStatus,
    headers: {
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
    },
  });

  applySecurityHeaders(response.headers);
  return response;
}
