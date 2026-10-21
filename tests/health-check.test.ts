import { describe, it, expect, vi } from "vitest";
import { performHealthCheck, GET, HEAD } from "@/app/api/health/route";
import { SupabaseClient } from "@supabase/supabase-js";

describe("Phase 12: Health Check Endpoint (/api/health)", () => {
  it("returns healthy status (HTTP 200) when database and outbox are operational", async () => {
    // Mock healthy Supabase client
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "outbox_events") {
          return {
            select: vi.fn().mockImplementation((_fields, options) => {
              if (options?.head) {
                return {
                  limit: vi.fn().mockResolvedValue({ count: 1, error: null }),
                  eq: vi
                    .fn()
                    .mockImplementation((field: string, val: string) => {
                      if (val === "QUEUED")
                        return Promise.resolve({ count: 5, error: null });
                      if (val === "DEAD_LETTER")
                        return Promise.resolve({ count: 0, error: null });
                      return Promise.resolve({ count: 0, error: null });
                    }),
                };
              }
              return Promise.resolve({ data: [], error: null });
            }),
          };
        }
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    } as unknown as SupabaseClient;

    const { result, httpStatus } = await performHealthCheck({
      supabaseClient: mockSupabase,
    });

    expect(httpStatus).toBe(200);
    expect(result.status).toBe("healthy");
    expect(result.checks.database.status).toBe("up");
    expect(typeof result.checks.database.latencyMs).toBe("number");
    expect(result.checks.outbox.status).toBe("healthy");
    expect(result.checks.outbox.queuedCount).toBe(5);
    expect(result.checks.outbox.deadLetterCount).toBe(0);
    expect(result.checks.memory.heapUsedMb).toBeGreaterThan(0);
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("returns degraded status (HTTP 200) when outbox has high queued backlog", async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "outbox_events") {
          return {
            select: vi.fn().mockImplementation((_fields, options) => {
              if (options?.head) {
                return {
                  limit: vi.fn().mockResolvedValue({ count: 1, error: null }),
                  eq: vi
                    .fn()
                    .mockImplementation((_field: string, val: string) => {
                      if (val === "QUEUED")
                        return Promise.resolve({ count: 250, error: null });
                      if (val === "DEAD_LETTER")
                        return Promise.resolve({ count: 2, error: null });
                      return Promise.resolve({ count: 0, error: null });
                    }),
                };
              }
              return Promise.resolve({ data: [], error: null });
            }),
          };
        }
        return {};
      }),
    } as unknown as SupabaseClient;

    const { result, httpStatus } = await performHealthCheck({
      supabaseClient: mockSupabase,
    });

    expect(httpStatus).toBe(200);
    expect(result.status).toBe("degraded");
    expect(result.checks.outbox.status).toBe("backlog_warning");
    expect(result.checks.outbox.queuedCount).toBe(250);
  });

  it("returns degraded status (HTTP 200) when dead letter queue exceeds critical threshold", async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "outbox_events") {
          return {
            select: vi.fn().mockImplementation((_fields, options) => {
              if (options?.head) {
                return {
                  limit: vi.fn().mockResolvedValue({ count: 1, error: null }),
                  eq: vi
                    .fn()
                    .mockImplementation((_field: string, val: string) => {
                      if (val === "QUEUED")
                        return Promise.resolve({ count: 10, error: null });
                      if (val === "DEAD_LETTER")
                        return Promise.resolve({ count: 15, error: null });
                      return Promise.resolve({ count: 0, error: null });
                    }),
                };
              }
              return Promise.resolve({ data: [], error: null });
            }),
          };
        }
        return {};
      }),
    } as unknown as SupabaseClient;

    const { result, httpStatus } = await performHealthCheck({
      supabaseClient: mockSupabase,
    });

    expect(httpStatus).toBe(200);
    expect(result.status).toBe("degraded");
    expect(result.checks.outbox.status).toBe("critical_dlq_high");
    expect(result.checks.outbox.deadLetterCount).toBe(15);
  });

  it("returns unhealthy status (HTTP 503) when database connection fails", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Connection pool timeout" },
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const { result, httpStatus } = await performHealthCheck({
      supabaseClient: mockSupabase,
    });

    expect(httpStatus).toBe(503);
    expect(result.status).toBe("unhealthy");
    expect(result.checks.database.status).toBe("down");
    expect(result.checks.database.error).toBe("Connection pool timeout");
  });

  it("handles unconfigured Supabase gracefully without crashing", async () => {
    const { result, httpStatus } = await performHealthCheck({
      supabaseClient: null,
    });

    // In local/test unconfigured environment
    expect(httpStatus).toBe(200);
    expect(result.checks.database.status).toBe("unconfigured");
    expect(result.status).toBe("degraded");
  });

  it("GET handler sets no-cache directives and security headers", async () => {
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate",
    );
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("HEAD handler returns response with empty body and appropriate status code", async () => {
    const response = await HEAD();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate",
    );
  });

  it("returns lean { status: 'ok' } without internal leaks on public unauthenticated requests", async () => {
    const publicReq = new Request("https://leadrescue.example.com/api/health");
    const response = await GET(publicReq);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("public");
    const body = await response.json();
    expect(body).toEqual({ status: "ok" });
    expect(body.checks).toBeUndefined();
    expect(body.uptimeSeconds).toBeUndefined();
    expect(body.version).toBeUndefined();
  });
});
