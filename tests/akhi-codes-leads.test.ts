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

describe("Akhi Codes Real Dataset: 10 Messy Stalled Client Threads", () => {
  beforeEach(() => {
    demoStore.reset([]);
  });

  it("ingests 10 messy Akhi Codes leads and diagnoses real objections and ghosting patterns", async () => {
    const csvPath = path.resolve(
      process.cwd(),
      "fixtures/10-akhi-codes-stalled-leads.csv",
    );
    expect(fs.existsSync(csvPath)).toBe(true);

    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const importRes = await initiateCsvImportAction({
      fileName: "10-akhi-codes-stalled-leads.csv",
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

    expect(importRes.success).toBe(true);
    if (!importRes.success) return;

    expect(importRes.result.totalRows).toBe(10);
    expect(importRes.result.successfulRows).toBe(10);

    // Verify all 10 leads appear in directory
    const dir = await fetchWorkspaceLeadsKeyset({ limit: 20 });
    expect(dir.leads).toHaveLength(10);

    // TEST LEAD 1: Rohan Sharma (Twitter DM, "looks sick bro let me talk to my cofounder", 18 days stalled)
    const rohan = dir.leads.find((l) => l.firstName === "Rohan");
    expect(rohan).toBeDefined();

    const rohanEval = await runAgentEvaluationAction({ leadId: rohan!.id });
    expect(rohanEval.success).toBe(true);
    expect(rohanEval.data!.assessment.churnRiskScore).toBeGreaterThanOrEqual(75);
    expect(["HIGH", "CRITICAL"]).toContain(rohanEval.data!.assessment.churnRisk);
    expect([
      "AUTHORITY_HIERARCHY",
      "TIMING_GHOSTING",
      "BUDGET_PRICING",
    ]).toContain(rohanEval.data!.assessment.detectedObjection);

    // TEST LEAD 2: Kavita Reddy (WhatsApp 50/50 split agreed, unpaid invoice, 12 days stalled)
    const kavita = dir.leads.find((l) => l.firstName === "Kavita");
    expect(kavita).toBeDefined();

    const kavitaEval = await runAgentEvaluationAction({ leadId: kavita!.id });
    expect(kavitaEval.success).toBe(true);
    expect(kavitaEval.data!.assessment.churnRiskScore).toBeGreaterThanOrEqual(70);

    // TEST LEAD 3: Alex Rivera (Telegram, crypto dashboard, Eastern Europe dev $1.5k comparison)
    const alex = dir.leads.find((l) => l.firstName === "Alex");
    expect(alex).toBeDefined();

    const alexEval = await runAgentEvaluationAction({ leadId: alex!.id });
    expect(alexEval.success).toBe(true);
    expect(["COMPETITOR_EVALUATION", "BUDGET_PRICING"]).toContain(
      alexEval.data!.assessment.detectedObjection,
    );

    // TEST LEAD 4: Execute Agent Action Plan on Rohan
    const plan = rohanEval.data!.plan;
    const execRes = await executeAgentPlanAction({
      leadId: rohan!.id,
      plan,
      leadName: "Rohan Sharma",
      leadEmail: "rohan@hypergrowthhq.com",
      companyName: "HyperGrowth Media",
    });

    expect(execRes.success).toBe(true);
    expect(execRes.stageUpdated).toBe(true);
    expect(execRes.reminderScheduled).toBe(true);

    // Verify outbox worker tick handles failure retry and subsequent completion
    const pendingJob = demoStore["outboxEvents"].find(
      (e) => (e.payload as Record<string, unknown>).leadId === rohan!.id,
    );
    expect(pendingJob).toBeDefined();
    pendingJob!.availableAt = new Date(Date.now() - 5000).toISOString();

    // 1. Simulated Provider Failure (e.g. invalid API key or timeout)
    const failureRun = await runOutboxWorkerTick({
      batchSize: 5,
      simulateFailure: true,
      failureError: "Resend API Error (401): Invalid API Key",
    });
    expect(failureRun.failedCount).toBeGreaterThanOrEqual(1);
    expect(pendingJob!.attempts).toBe(1);
    expect(pendingJob!.status).toBe("QUEUED");

    // 2. Recovery on valid key
    pendingJob!.availableAt = new Date(Date.now() - 1000).toISOString();
    const successRun = await runOutboxWorkerTick({
      batchSize: 5,
      simulateFailure: false,
    });
    expect(successRun.succeededCount).toBeGreaterThanOrEqual(1);
    expect(pendingJob!.status).toBe("COMPLETED");

    // Check reminder record status updated to SENT
    const reminder = demoStore
      .listReminders()
      .find((r) => r.leadId === rohan!.id);
    expect(reminder!.status).toBe("SENT");
  });
});
