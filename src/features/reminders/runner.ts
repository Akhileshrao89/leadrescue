import { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { claimOutboxJobs, completeOutboxJob, failOutboxJob } from "./outbox";
import { dispatchOutboxJob } from "./dispatcher";
import { WorkerRunResult } from "./types";
import { demoStore } from "@/features/leads/demo-store";

export interface RunWorkerTickOptions {
  batchSize?: number;
  leaseSeconds?: number;
  supabaseClient?: SupabaseClient;
  simulateFailure?: boolean;
  failureError?: string;
}

/**
 * Runs a single background worker execution tick.
 * 1. Atomically claims up to batchSize ready jobs using FOR UPDATE SKIP LOCKED.
 * 2. Processes each job via dispatcher.
 * 3. Marks completed or schedules exponential backoff / dead-letter on failure.
 * 4. Emits structured execution telemetry.
 */
export async function runOutboxWorkerTick(
  options: RunWorkerTickOptions = {},
): Promise<WorkerRunResult> {
  const startTime = Date.now();
  const supabase =
    options.supabaseClient || (await createServerSupabaseClient());

  const result: WorkerRunResult = {
    claimedCount: 0,
    processedCount: 0,
    succeededCount: 0,
    failedCount: 0,
    deadLetterCount: 0,
    durationMs: 0,
    errors: [],
  };

  if (!supabase) {
    // Process local in-memory outbox jobs in demo mode
    const claimed = demoStore.claimOutbox(
      options.batchSize ?? 10,
      options.leaseSeconds ?? 120,
    );
    result.claimedCount = claimed.length;

    for (const job of claimed) {
      result.processedCount++;
      if (options.simulateFailure) {
        const errorMsg =
          options.failureError || "Simulated 500 upstream SMTP network failure";
        const failRes = demoStore.failOutbox(job.id, errorMsg);
        result.failedCount++;
        if (failRes.deadLetter) result.deadLetterCount++;
        result.errors.push({ eventId: job.id, error: errorMsg });
      } else {
        demoStore.completeOutbox(job.id);
        result.succeededCount++;
      }
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  const claimResult = await claimOutboxJobs(supabase, {
    batchSize: options.batchSize ?? 10,
    leaseDurationSeconds: options.leaseSeconds ?? 120,
  });

  if (!claimResult.success) {
    result.durationMs = Date.now() - startTime;
    result.errors.push({
      eventId: "claim",
      error: claimResult.error || "Failed to claim outbox jobs",
    });
    return result;
  }

  result.claimedCount = claimResult.jobs.length;

  for (const job of claimResult.jobs) {
    result.processedCount++;
    try {
      const dispatchResult = await dispatchOutboxJob(supabase, job);

      if (dispatchResult.success) {
        await completeOutboxJob(supabase, job.id);
        result.succeededCount++;
      } else {
        const errorMsg =
          dispatchResult.error || "Dispatcher returned unsuccessful";
        const failRes = await failOutboxJob(supabase, job, errorMsg);
        result.failedCount++;
        if (failRes.deadLetter) result.deadLetterCount++;
        result.errors.push({ eventId: job.id, error: errorMsg });
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Unhandled worker exception";
      const failRes = await failOutboxJob(supabase, job, errorMsg);
      result.failedCount++;
      if (failRes.deadLetter) result.deadLetterCount++;
      result.errors.push({ eventId: job.id, error: errorMsg });
    }
  }

  result.durationMs = Date.now() - startTime;
  return result;
}
