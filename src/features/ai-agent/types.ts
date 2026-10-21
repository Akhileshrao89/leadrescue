import { LeadStage } from "@/features/leads/types";
import { DraftTone } from "@/features/ai-drafts/types";

export type ChurnRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ObjectionType =
  | "BUDGET_PRICING"
  | "TIMING_GHOSTING"
  | "AUTHORITY_HIERARCHY"
  | "COMPETITOR_EVALUATION"
  | "TRUST_CREDIBILITY"
  | "UNCLEAR_NEED"
  | "NO_OBJECTION_WARM";

export interface LeadAssessment {
  churnRisk: ChurnRiskLevel;
  churnRiskScore: number; // 0 - 100
  dealVelocityDays: number;
  detectedObjection: ObjectionType;
  psychologicalContext: string;
  recommendedTactic: string;
}

export interface AgentActionPlan {
  recommendedStage: LeadStage;
  recommendedTone: DraftTone | "CONSULTATIVE" | "PROVOCATIVE";
  followUpOffsetDays: number;
  optimalSendWindow: string; // e.g. "Tuesday morning 09:30 AM local time"
  suggestedSubject: string;
  personalizedBody: string;
  reasoningTrace: string[]; // Chain-of-thought rationale
  alternativeOptions: string[];
}

export interface AgentRunResult {
  leadId: string;
  confidenceScore: number; // 0 - 100
  assessment: LeadAssessment;
  plan: AgentActionPlan;
  executedAt: string;
  tokensConsumed: number;
}
