import { describe, it, expect } from "vitest";
import { runAutonomousAgentEvaluation } from "@/features/ai-agent/engine";
import { executeAgentPlan } from "@/features/ai-agent/tools";
import { Lead } from "@/features/leads/types";

describe("Agentic AI: Autonomous Cognitive Reasoning & Tool Execution Engine", () => {
  const baseLead: Lead = {
    id: "lead_agent_1",
    workspaceId: "ws_agency_1",
    firstName: "Marcus",
    lastName: "Vance",
    email: "marcus@vancecapital.com",
    companyName: "Vance Capital",
    phone: "+15552345678",
    stage: "NEW",
    source: "WEBSITE_CONTACT",
    notes: "Interested in full website overhaul.",
    isArchived: false,
    version: 1,
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
    updatedAt: new Date().toISOString(),
  };

  it("evaluates a NEW lead and formulates a Speed-to-Lead value audit strategy", () => {
    const result = runAutonomousAgentEvaluation({
      lead: baseLead,
      workspaceName: "Apex Digital",
      senderName: "Sarah Connor",
    });

    expect(result.leadId).toBe("lead_agent_1");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(result.assessment.recommendedTactic).toContain("Speed-to-Lead");
    expect(result.plan.recommendedStage).toBe("CONTACTED");
    expect(result.plan.suggestedSubject).toContain("Vance Capital");
    expect(result.plan.personalizedBody).toContain("Marcus");
    expect(result.plan.personalizedBody).toContain("Apex Digital");
    expect(result.plan.reasoningTrace.length).toBeGreaterThanOrEqual(3);
  });

  it("diagnoses budget objections and synthesizes a phased ROI approach", () => {
    const budgetLead: Lead = {
      ...baseLead,
      stage: "CONTACTED",
      notes:
        "Client mentioned our proposal is slightly over their current quarterly budget.",
    };

    const result = runAutonomousAgentEvaluation({
      lead: budgetLead,
      workspaceName: "Apex Digital",
      senderName: "Sarah Connor",
    });

    expect(result.assessment.detectedObjection).toBe("BUDGET_PRICING");
    expect(result.assessment.recommendedTactic).toContain("ROI Reframe");
    expect(result.plan.recommendedTone).toBe("CONSULTATIVE");
    expect(result.plan.personalizedBody).toContain("phased approach");
  });

  it("diagnoses ghosting / stalling and deploys a 9-word re-engagement pattern interrupt", () => {
    const ghostedLead: Lead = {
      ...baseLead,
      stage: "CONTACTED",
      createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), // 20 days ago
      notes: "No reply to previous 2 emails. Stalled deal.",
    };

    const result = runAutonomousAgentEvaluation({
      lead: ghostedLead,
      workspaceName: "Apex Digital",
      senderName: "Sarah Connor",
    });

    expect(result.assessment.churnRisk).toBe("CRITICAL");
    expect(result.assessment.recommendedTactic).toContain("9-Word");
    expect(result.plan.recommendedTone).toBe("PROVOCATIVE");
    expect(result.plan.suggestedSubject).toContain("Quick check");
    expect(result.plan.personalizedBody).toContain(
      "Are you still looking to improve",
    );
  });

  it("executes the autonomous agent plan seamlessly in demo mode", async () => {
    const evalResult = runAutonomousAgentEvaluation({
      lead: baseLead,
      workspaceName: "Apex Digital",
      senderName: "Sarah Connor",
    });

    const execution = await executeAgentPlan({
      supabase: null, // Demo mode fallback
      workspaceId: "ws_demo",
      leadId: baseLead.id,
      userId: "usr_agent_runner",
      plan: evalResult.plan,
      leadName: "Marcus Vance",
      leadEmail: baseLead.email || undefined,
      companyName: baseLead.companyName || undefined,
    });

    expect(execution.success).toBe(true);
    expect(execution.stageUpdated).toBe(true);
    expect(execution.reminderScheduled).toBe(true);
    expect(execution.reminderId).toBeDefined();
    expect(execution.activityLogged).toBe(true);
  });
});
