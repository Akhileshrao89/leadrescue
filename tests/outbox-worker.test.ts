import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeExponentialBackoffSeconds,
  calculateNextAvailableAt,
} from "@/features/reminders/backoff";
import {
  enqueueOutboxJob,
  claimOutboxJobs,
  completeOutboxJob,
  failOutboxJob,
} from "@/features/reminders/outbox";
import { runOutboxWorkerTick } from "@/features/reminders/runner";
import { SupabaseClient } from "@supabase/supabase-js";

describe("Phase 7: Outbox Worker & Concurrency Control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Exponential Backoff with Jitter", () => {
    it("computes exact exponential backoff without jitter", () => {
      expect(
        computeExponentialBackoffSeconds(0, {
          baseSeconds: 30,
          enableJitter: false,
        }),
      ).toBe(30);
      expect(
        computeExponentialBackoffSeconds(1, {
          baseSeconds: 30,
          enableJitter: false,
        }),
      ).toBe(60);
      expect(
        computeExponentialBackoffSeconds(2, {
          baseSeconds: 30,
          enableJitter: false,
        }),
      ).toBe(120);
      expect(
        computeExponentialBackoffSeconds(3, {
          baseSeconds: 30,
          enableJitter: false,
        }),
      ).toBe(240);
      expect(
        computeExponentialBackoffSeconds(4, {
          baseSeconds: 30,
          enableJitter: false,
        }),
      ).toBe(480);
    });

    it("respects maxSeconds ceiling", () => {
      const backoff = computeExponentialBackoffSeconds(15, {
        baseSeconds: 30,
        maxSeconds: 1800,
        enableJitter: false,
      });
      expect(backoff).toBe(1800);
    });

    it("applies jitter bounded within 0% to 20% range", () => {
      const base = 100;
      for (let i = 0; i < 20; i++) {
        const val = computeExponentialBackoffSeconds(0, {
          baseSeconds: base,
          enableJitter: true,
        });
        expect(val).toBeGreaterThanOrEqual(base);
        expect(val).toBeLessThanOrEqual(base * 1.25);
      }
    });

    it("returns future Date for calculateNextAvailableAt", () => {
      const now = Date.now();
      const nextDate = calculateNextAvailableAt(1, {
        baseSeconds: 30,
        enableJitter: false,
      });
      expect(nextDate.getTime()).toBeGreaterThanOrEqual(now + 60 * 1000 - 100);
    });
  });

  describe("Outbox Job Lifecycle & Dead-Letter Transition", () => {
    it("enqueues an outbox job in QUEUED status", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: "outbox-evt-1" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ insert: mockInsert }),
      } as unknown as SupabaseClient;

      const res = await enqueueOutboxJob(mockSupabase, {
        workspaceId: "ws-1",
        jobType: "SEND_REMINDER",
        payload: { reminderId: "rem-1" },
        maxAttempts: 5,
      });

      expect(res.success).toBe(true);
      expect(res.eventId).toBe("outbox-evt-1");
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          workspace_id: "ws-1",
          job_type: "SEND_REMINDER",
          status: "QUEUED",
          attempts: 0,
          max_attempts: 5,
        }),
      );
    });

    it("completes job and clears lease token", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ update: mockUpdate }),
      } as unknown as SupabaseClient;

      const res = await completeOutboxJob(mockSupabase, "outbox-evt-1");
      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "COMPLETED",
          lease_token: null,
        }),
      );
    });

    it("reschedules job with backoff when attempts < maxAttempts", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ update: mockUpdate }),
      } as unknown as SupabaseClient;

      const job = {
        id: "outbox-evt-1",
        workspaceId: "ws-1",
        jobType: "SEND_REMINDER",
        payload: {},
        status: "PROCESSING" as const,
        attempts: 1,
        maxAttempts: 5,
        availableAt: new Date().toISOString(),
        leaseToken: "lease-123",
        leaseExpiresAt: new Date().toISOString(),
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await failOutboxJob(
        mockSupabase,
        job,
        "Network connection timeout",
      );

      expect(res.success).toBe(true);
      expect(res.deadLetter).toBe(false);
      expect(res.nextAvailableAt).toBeDefined();

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: 2,
          status: "QUEUED",
          last_error: "Network connection timeout",
          lease_token: null,
        }),
      );
    });

    it("transitions job to DEAD_LETTER when attempts reach maxAttempts", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ update: mockUpdate }),
      } as unknown as SupabaseClient;

      const job = {
        id: "outbox-evt-dead",
        workspaceId: "ws-1",
        jobType: "SEND_REMINDER",
        payload: {},
        status: "PROCESSING" as const,
        attempts: 4, // 5th attempt will exceed maxAttempts = 5
        maxAttempts: 5,
        availableAt: new Date().toISOString(),
        leaseToken: "lease-123",
        leaseExpiresAt: new Date().toISOString(),
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await failOutboxJob(
        mockSupabase,
        job,
        "Permanent 400 Bad Request",
      );

      expect(res.success).toBe(true);
      expect(res.deadLetter).toBe(true);
      expect(res.nextAvailableAt).toBeUndefined();

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: 5,
          status: "DEAD_LETTER",
          last_error: "Permanent 400 Bad Request",
          lease_token: null,
        }),
      );
    });
  });

  describe("Atomic Batch Claiming with FOR UPDATE SKIP LOCKED", () => {
    it("invokes claim_outbox_batch RPC when available", async () => {
      const mockDbRow = {
        id: "outbox-evt-claimed",
        workspace_id: "ws-1",
        job_type: "SEND_REMINDER",
        payload: { reminderId: "rem-1" },
        status: "PROCESSING",
        attempts: 0,
        max_attempts: 5,
        available_at: new Date().toISOString(),
        lease_token: "lease-abc",
        lease_expires_at: new Date(Date.now() + 120000).toISOString(),
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockRpc = vi.fn().mockResolvedValue({
        data: [mockDbRow],
        error: null,
      });

      const mockSupabase = {
        rpc: mockRpc,
      } as unknown as SupabaseClient;

      const res = await claimOutboxJobs(mockSupabase, {
        batchSize: 5,
        leaseDurationSeconds: 120,
      });

      expect(res.success).toBe(true);
      expect(res.jobs).toHaveLength(1);
      expect(res.jobs[0].id).toBe("outbox-evt-claimed");
      expect(mockRpc).toHaveBeenCalledWith(
        "claim_outbox_batch",
        expect.objectContaining({
          p_batch_size: 5,
          p_lease_duration_seconds: 120,
        }),
      );
    });
  });

  describe("runOutboxWorkerTick execution", () => {
    it("runs tick and reports telemetry metrics", async () => {
      const mockDbJob = {
        id: "outbox-1",
        workspace_id: "ws-1",
        job_type: "SEND_REMINDER",
        payload: { reminderId: "rem-1", leadId: "lead-1" },
        status: "PROCESSING",
        attempts: 0,
        max_attempts: 5,
        available_at: new Date().toISOString(),
        lease_token: "token-1",
        lease_expires_at: new Date(Date.now() + 120000).toISOString(),
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mock reminder fetch: returns CANCELLED reminder so it safely skips and succeeds
      const mockFrom = vi.fn((table: string) => {
        if (table === "reminders") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "rem-1",
                    status: "CANCELLED",
                    workspace_id: "ws-1",
                    lead_id: "lead-1",
                    recipient_user_id: "user-1",
                    due_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "outbox_events") {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {};
      });

      const mockRpc = vi.fn().mockResolvedValue({
        data: [mockDbJob],
        error: null,
      });

      const mockSupabase = {
        rpc: mockRpc,
        from: mockFrom,
      } as unknown as SupabaseClient;

      const result = await runOutboxWorkerTick({
        batchSize: 10,
        supabaseClient: mockSupabase,
      });

      expect(result.claimedCount).toBe(1);
      expect(result.processedCount).toBe(1);
      expect(result.succeededCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.deadLetterCount).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
