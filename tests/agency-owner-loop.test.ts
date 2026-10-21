import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { initiateCsvImportAction } from "@/features/imports/actions";
import {
  fetchWorkspaceLeadsKeyset,
  fetchLeadByIdAction,
} from "@/features/leads/actions";
import {
  runAgentEvaluationAction,
  executeAgentPlanAction,
} from "@/features/ai-agent/actions";
import { runOutboxWorkerTick } from "@/features/reminders/runner";
import { demoStore } from "@/features/leads/demo-store";

describe("Agency Owner Reality Check: Full End-to-End Operational Loop", () => {
  beforeEach(() => {
    // Reset process-level demo store with a clean slate
    demoStore.reset([]);
  });

  it("executes the complete agency owner workflow from CSV batch ingestion to outbox retry recovery", async () => {
    // -------------------------------------------------------------------------
    // STEP 1: Ingest 50 Real Agency Leads from CSV
    // -------------------------------------------------------------------------
    const csvPath = path.resolve(process.cwd(), "fixtures/50-agency-leads.csv");
    expect(fs.existsSync(csvPath)).toBe(true);

    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const importResult = await initiateCsvImportAction({
      fileName: "50-agency-leads.csv",
      csvContent,
      mapping: {
        firstNameCol: "first_name",
        lastNameCol: "last_name",
        emailCol: "email",
        phoneCol: "phone",
        companyCol: "company_name",
        websiteCol: "website",
        stageCol: "stage",
        sourceCol: "source",
        notesCol: "notes",
        nextFollowUpCol: "next_follow_up_at",
      },
      duplicatePolicy: "SKIP",
    });

    expect(importResult.success).toBe(true);
    if (!importResult.success) return;

    expect(importResult.result.totalRows).toBe(50);
    expect(importResult.result.successfulRows).toBe(50);
    expect(importResult.result.failedRows).toBe(0);
    expect(importResult.result.errors).toHaveLength(0);

    // -------------------------------------------------------------------------
    // STEP 2: Verify Directory Querying, Pagination, and Search
    // -------------------------------------------------------------------------
    // Fetch first page (limit = 25)
    const page1 = await fetchWorkspaceLeadsKeyset({
      limit: 25,
      sortBy: "created_at",
      sortDirection: "desc",
    });

    expect(page1.leads).toHaveLength(25);
    expect(page1.hasMore).toBe(true);
    expect(page1.totalActiveCount).toBe(50);
    expect(page1.nextCursor).not.toBeNull();

    // Fetch second page using keyset cursor
    const page2 = await fetchWorkspaceLeadsKeyset({
      cursor: page1.nextCursor,
      limit: 25,
      sortBy: "created_at",
      sortDirection: "desc",
    });

    expect(page2.leads).toHaveLength(25);
    expect(page2.hasMore).toBe(false);

    // Verify search functionality locates specific agency prospect
    const searchResult = await fetchWorkspaceLeadsKeyset({
      search: "Summit Dental",
      limit: 10,
    });

    expect(searchResult.leads.length).toBeGreaterThanOrEqual(1);
    const targetLead = searchResult.leads.find(
      (l) => l.companyName === "Summit Dental Care",
    );
    expect(targetLead).toBeDefined();
    expect(targetLead!.firstName).toBe("Michael");
    expect(targetLead!.stage).toBe("PROPOSAL");

    const targetLeadId = targetLead!.id;

    // -------------------------------------------------------------------------
    // STEP 3: Run Autonomous Agent Evaluation on Stalled Prospect
    // -------------------------------------------------------------------------
    const evalResult = await runAgentEvaluationAction({
      leadId: targetLeadId,
    });

    expect(evalResult.success).toBe(true);
    expect(evalResult.data).toBeDefined();

    const evaluation = evalResult.data!;
    // Must flag high churn risk (>70%) due to 21-day stale proposal with price hesitation
    expect(evaluation.assessment.churnRiskScore).toBeGreaterThanOrEqual(70);
    expect(["HIGH", "CRITICAL"]).toContain(evaluation.assessment.churnRisk);

    // Must diagnose timing/ghosting or budget objection
    expect([
      "TIMING_GHOSTING",
      "BUDGET_PRICING",
      "AUTHORITY_HIERARCHY",
    ]).toContain(evaluation.assessment.detectedObjection);

    // Must synthesize Dean Jackson 9-word re-engagement tactic or value reframe
    expect(evaluation.assessment.recommendedTactic).toBeDefined();
    expect(evaluation.plan.suggestedSubject.length).toBeGreaterThan(0);
    expect(evaluation.plan.personalizedBody.length).toBeGreaterThan(0);
    expect(evaluation.plan.reasoningTrace.length).toBeGreaterThanOrEqual(2);

    // -------------------------------------------------------------------------
    // STEP 4: Execute Agent Action Plan in 1-Click
    // -------------------------------------------------------------------------
    const execResult = await executeAgentPlanAction({
      leadId: targetLeadId,
      plan: evaluation.plan,
      leadName: "Michael Chen",
      leadEmail: "michael@summitdentalcare.com",
      companyName: "Summit Dental Care",
    });

    expect(execResult.success).toBe(true);
    expect(execResult.stageUpdated).toBe(true);
    expect(execResult.reminderScheduled).toBe(true);
    expect(execResult.activityLogged).toBe(true);
    expect(execResult.reminderId).toBeDefined();

    // Verify lead state is updated in the persistent store
    const updatedLeadRes = await fetchLeadByIdAction(targetLeadId);
    expect(updatedLeadRes.lead).toBeDefined();
    expect(updatedLeadRes.lead!.stage).toBe(evaluation.plan.recommendedStage);
    expect(updatedLeadRes.lead!.nextFollowUpAt).not.toBeNull();

    // Verify activity timeline logged the autonomous agent plan
    expect(updatedLeadRes.activities.length).toBeGreaterThanOrEqual(2);
    const agentActivity = updatedLeadRes.activities.find(
      (a) => a.type === "FOLLOW_UP_SCHEDULED",
    );
    expect(agentActivity).toBeDefined();

    // -------------------------------------------------------------------------
    // STEP 5: Worker Tick with Simulated Failure (Exponential Backoff Test)
    // -------------------------------------------------------------------------
    // Force the scheduled reminder outbox event to be immediately available
    const pendingOutbox = demoStore["outboxEvents"].find(
      (e) =>
        e.status === "QUEUED" &&
        (e.payload as Record<string, unknown>).leadId === targetLeadId,
    );
    expect(pendingOutbox).toBeDefined();
    pendingOutbox!.availableAt = new Date(Date.now() - 5000).toISOString();

    const failureTick = await runOutboxWorkerTick({
      batchSize: 10,
      simulateFailure: true,
      failureError: "Upstream provider 500: SMTP connection timed out",
    });

    expect(failureTick.claimedCount).toBeGreaterThanOrEqual(1);
    expect(failureTick.failedCount).toBeGreaterThanOrEqual(1);
    expect(failureTick.errors[0]?.error).toContain("SMTP connection timed out");

    // Assert that the job was NOT permanently dropped or dead-lettered
    expect(pendingOutbox!.attempts).toBe(1);
    expect(pendingOutbox!.status).toBe("QUEUED");
    expect(pendingOutbox!.lastError).toContain("SMTP connection timed out");
    // Assert exponential backoff pushed availableAt into the future
    expect(new Date(pendingOutbox!.availableAt).getTime()).toBeGreaterThan(
      Date.now() - 2000,
    );

    // -------------------------------------------------------------------------
    // STEP 6: Worker Tick Recovery on Second Attempt (Successful Delivery)
    // -------------------------------------------------------------------------
    // Fast-forward availableAt to simulate backoff window passing
    pendingOutbox!.availableAt = new Date(Date.now() - 1000).toISOString();

    const successTick = await runOutboxWorkerTick({
      batchSize: 10,
      simulateFailure: false,
    });

    expect(successTick.claimedCount).toBeGreaterThanOrEqual(1);
    expect(successTick.succeededCount).toBeGreaterThanOrEqual(1);

    // Verify outbox job is marked COMPLETED
    expect(pendingOutbox!.status).toBe("COMPLETED");

    // Verify the reminder record was marked SENT
    const reminder = demoStore
      .listReminders()
      .find((r) => r.leadId === targetLeadId);
    expect(reminder).toBeDefined();
    expect(reminder!.status).toBe("SENT");
    expect(reminder!.sentAt).not.toBeNull();
  });
});
