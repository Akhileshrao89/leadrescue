import { Lead } from "@/features/leads/types";
import {
  AgentRunResult,
  ChurnRiskLevel,
  LeadAssessment,
  ObjectionType,
  AgentActionPlan,
} from "./types";
import { sanitizeNotesForPrompt } from "@/features/ai-drafts/sanitizer";

export interface AgentEvaluationInput {
  lead: Lead;
  workspaceName?: string;
  senderName?: string;
}

/**
 * Detects implicit or explicit objections from prospect communication and notes.
 */
function diagnoseObjections(notes: string | undefined): ObjectionType {
  if (!notes) return "NO_OBJECTION_WARM";
  const lower = notes.toLowerCase();

  if (
    lower.includes("price") ||
    lower.includes("budget") ||
    lower.includes("cost") ||
    lower.includes("expensive") ||
    lower.includes("afford")
  ) {
    return "BUDGET_PRICING";
  }

  if (
    lower.includes("ghost") ||
    lower.includes("no reply") ||
    lower.includes("busy") ||
    lower.includes("later") ||
    lower.includes("next quarter") ||
    lower.includes("q1") ||
    lower.includes("q2") ||
    lower.includes("q3") ||
    lower.includes("q4")
  ) {
    return "TIMING_GHOSTING";
  }

  if (
    lower.includes("boss") ||
    lower.includes("partner") ||
    lower.includes("board") ||
    lower.includes("stakeholder") ||
    lower.includes("team review")
  ) {
    return "AUTHORITY_HIERARCHY";
  }

  if (
    lower.includes("competitor") ||
    lower.includes("agency") ||
    lower.includes("other vendor") ||
    lower.includes("comparing")
  ) {
    return "COMPETITOR_EVALUATION";
  }

  if (
    lower.includes("case study") ||
    lower.includes("proof") ||
    lower.includes("reference") ||
    lower.includes("guarantee")
  ) {
    return "TRUST_CREDIBILITY";
  }

  return "NO_OBJECTION_WARM";
}

/**
 * Calculates deal inactivity and churn risk score (0 - 100).
 */
function calculateChurnRisk(
  lead: Lead,
  objection?: ObjectionType,
): {
  churnRisk: ChurnRiskLevel;
  score: number;
  velocityDays: number;
} {
  const now = Date.now();

  // Determine elapsed inactivity days from last contact, overdue follow-up, notes analysis, or creation
  const referenceTimestamp = new Date(
    lead.lastContactedAt ||
      lead.createdAt ||
      ((lead as unknown as Record<string, string>).created_at as string) ||
      Date.now(),
  ).getTime();

  let overdueDays = 0;
  if (lead.nextFollowUpAt) {
    const dueTime = new Date(lead.nextFollowUpAt).getTime();
    if (dueTime < now) {
      overdueDays = Math.round((now - dueTime) / (1000 * 60 * 60 * 24));
    }
  }

  // Parse days mentioned in notes (e.g. "21 days ago", "14 days")
  let notesDays = 0;
  if (lead.notes) {
    const match = lead.notes.match(/(\d+)\s*days?/i);
    if (match) {
      notesDays = parseInt(match[1], 10);
    }
  }

  const creationVelocityDays = Math.max(
    0,
    Math.round((now - referenceTimestamp) / (1000 * 60 * 60 * 24)),
  );

  const velocityDays = Math.max(creationVelocityDays, overdueDays, notesDays);

  let score = 20; // Base baseline risk

  // Velocity penalty
  if (velocityDays > 14) score += 45;
  else if (velocityDays > 7) score += 30;
  else if (velocityDays > 3) score += 15;

  // Overdue follow-up penalty
  if (overdueDays > 7) score += 20;
  else if (overdueDays > 1) score += 10;

  // Stage friction penalty
  if (lead.stage === "NEW" && velocityDays > 2) score += 25; // Speed to lead failure
  if (lead.stage === "PROPOSAL" && velocityDays > 5) score += 35; // Stalled close
  if (objection === "TIMING_GHOSTING") score += 15; // Unresponsive penalty
  if (objection === "BUDGET_PRICING" && lead.stage === "PROPOSAL") score += 15;
  if (lead.notes && /stalled|ghosted|unresponsive/i.test(lead.notes))
    score += 15;

  if (lead.stage === "LOST") score = 95;
  if (lead.stage === "WON") score = 5;

  score = Math.min(100, Math.max(0, score));

  let churnRisk: ChurnRiskLevel = "LOW";
  if (score >= 75) churnRisk = "CRITICAL";
  else if (score >= 50) churnRisk = "HIGH";
  else if (score >= 30) churnRisk = "MEDIUM";

  return { churnRisk, score, velocityDays };
}

/**
 * Autonomous Agent Cognitive Engine.
 * Evaluates prospect multi-dimensional signals, produces reasoning trace,
 * and formulates a complete conversion-focused action plan.
 */
export function runAutonomousAgentEvaluation(
  input: AgentEvaluationInput,
): AgentRunResult {
  const {
    lead,
    workspaceName = "Our Agency",
    senderName = "Account Director",
  } = input;
  const sanitizedNotes = sanitizeNotesForPrompt(lead.notes || "").sanitized;
  const objection = diagnoseObjections(sanitizedNotes);
  const { churnRisk, score, velocityDays } = calculateChurnRisk(
    lead,
    objection,
  );

  const firstName =
    lead.firstName?.trim() ||
    ((lead as unknown as Record<string, string>).first_name as string) ||
    "there";
  const company =
    lead.companyName?.trim() ||
    ((lead as unknown as Record<string, string>).company_name as string) ||
    "your business";

  const reasoningTrace: string[] = [
    `Observed deal velocity: ${velocityDays} days in pipeline under stage [${lead.stage}].`,
    `Computed churn risk index: ${score}/100 (${churnRisk}).`,
    `Diagnosed primary conversation obstacle: [${objection}].`,
  ];

  let recommendedStage = lead.stage;
  let recommendedTone: AgentActionPlan["recommendedTone"] = "FRIENDLY";
  let followUpOffsetDays = 2;
  let recommendedTactic = "";
  let suggestedSubject = "";
  let personalizedBody = "";
  let psychologicalContext = "";

  // Dynamic tactical planning based on agent reasoning
  if (lead.stage === "NEW") {
    recommendedStage = "CONTACTED";
    recommendedTone = "FRIENDLY";
    followUpOffsetDays = 1;
    recommendedTactic = "Speed-to-Lead High Value Audit";
    psychologicalContext =
      "Prospect recently requested inquiry. High receptivity window rapidly decays after 48 hours.";
    suggestedSubject = `Quick idea for ${company}'s conversion rate`;
    personalizedBody = `Hi ${firstName},\n\nI was looking through ${company}'s current web setup and noticed 2 straightforward adjustments that could immediately lift inbound lead inquiries.\n\nWould you be open to a 7-minute visual walkthrough on Thursday or Friday? No pitch—just actionable insights you can share with your team.\n\nBest regards,\n${senderName}\n${workspaceName}`;
    reasoningTrace.push(
      "Decision: Initiate high-value low-friction outreach to establish instant credibility.",
    );
  } else if (objection === "BUDGET_PRICING") {
    recommendedTone = "CONSULTATIVE";
    followUpOffsetDays = 2;
    recommendedTactic = "ROI Reframe & Phased Implementation";
    psychologicalContext =
      "Prospect perceives price as a cost rather than yield. Must reframe to payback timeline and lower upfront barrier.";
    suggestedSubject = `Alternative phased approach for ${company}`;
    personalizedBody = `Hi ${firstName},\n\nFollowing up on our discussion regarding scope and budget for ${company}.\n\nRather than executing everything at once, we often recommend starting with a Phase 1 High-Impact Sprint that addresses your immediate conversion bottlenecks first. This typically generates self-funding returns before moving to Phase 2.\n\nDo you have 10 minutes next Tuesday to review this phased approach?\n\nBest,\n${senderName}\n${workspaceName}`;
    reasoningTrace.push(
      "Decision: Break scope into phased sprints to eliminate budget friction.",
    );
  } else if (objection === "TIMING_GHOSTING" || churnRisk === "CRITICAL") {
    recommendedTone = "PROVOCATIVE";
    followUpOffsetDays = 3;
    recommendedTactic = "Dean Jackson 9-Word Pattern Interrupt / Soft Breakup";
    psychologicalContext =
      "Overwhelmed decision-maker avoiding long emails. Short, frictionless micro-questions yield 3.4x higher response rates.";
    suggestedSubject = `Quick check regarding ${company}`;
    personalizedBody = `Hi ${firstName},\n\nAre you still looking to improve lead conversion and website performance for ${company} this quarter?\n\nBest,\n${senderName}`;
    reasoningTrace.push(
      "Decision: Deploy 9-word re-engagement pattern interrupt to compel single-sentence response.",
    );
  } else if (lead.stage === "PROPOSAL") {
    recommendedTone = "PROFESSIONAL";
    followUpOffsetDays = 2;
    recommendedTactic = "Executive Implementation Timeline & Next Steps";
    psychologicalContext =
      "Decision-stage stalling often stems from fear of transition disruption or unclear launch roadmap.";
    suggestedSubject = `Launch timeline & next steps for ${company}`;
    personalizedBody = `Dear ${firstName},\n\nI wanted to share our projected implementation timeline for ${company} to ensure we can reserve onboarding capacity with our senior engineering team this month.\n\nWould you like to review the launch milestones together tomorrow at 2 PM, or is there any specific detail we should refine on the proposal?\n\nSincerely,\n${senderName}\n${workspaceName}`;
    reasoningTrace.push(
      "Decision: Surface implementation milestones and capacity scarcity to accelerate signing.",
    );
  } else {
    // Default Consultative Follow-Up
    recommendedTone = "FRIENDLY";
    followUpOffsetDays = 3;
    recommendedTactic = "Relevant Peer Case Study Proof";
    psychologicalContext =
      "Social proof and tangible performance benchmarks lower perceived evaluation risk.";
    suggestedSubject = `Relevant benchmark study for ${company}`;
    personalizedBody = `Hi ${firstName},\n\nThought of ${company} this morning while reviewing our recent case study where we doubled qualified demo bookings for a similar team in your industry.\n\nHappy to forward the 1-page summary if you find it helpful. Let me know!\n\nBest,\n${senderName}`;
    reasoningTrace.push(
      "Decision: Provide third-party case study proof to validate capability.",
    );
  }

  const assessment: LeadAssessment = {
    churnRisk,
    churnRiskScore: score,
    dealVelocityDays: velocityDays,
    detectedObjection: objection,
    psychologicalContext,
    recommendedTactic,
  };

  const plan: AgentActionPlan = {
    recommendedStage,
    recommendedTone,
    followUpOffsetDays,
    optimalSendWindow: "Between 09:15 AM - 11:30 AM local time",
    suggestedSubject,
    personalizedBody,
    reasoningTrace,
    alternativeOptions: [
      "Escalate directly to phone touchpoint if email receives no reply within 48h",
      "Switch to LinkedIn connection / executive DM if email bounce is detected",
      "Archive and schedule automatic 60-day reactivation campaign if no response",
    ],
  };

  return {
    leadId: lead.id,
    // Heuristic score only; this is not a calibrated probability.
    confidenceScore: Math.max(50, Math.min(85, 80 - Math.round(score * 0.15))),
    assessment,
    plan,
    executedAt: new Date().toISOString(),
    tokensConsumed: 0, // This rule-based engine does not call an LLM.
  };
}
