export type TouchpointType =
  "FIRST_TOUCH" | "POST_DISCOVERY" | "PROPOSAL_CHECK_IN" | "RE_ENGAGEMENT";

export type DraftTone = "PROFESSIONAL" | "FRIENDLY" | "URGENT";

export interface GenerateDraftInput {
  workspaceId: string;
  leadId: string;
  touchpointType: TouchpointType;
  tone?: DraftTone;
  useAi?: boolean;
}

export interface GeneratedDraftResult {
  subject: string;
  body: string;
  isAiGenerated: boolean;
  quotaRemaining: number;
  generationDurationMs: number;
}

export interface TemplateContext {
  firstName: string;
  lastName?: string | null;
  companyName?: string | null;
  website?: string | null;
  notes?: string | null;
  senderAgencyName?: string | null;
  senderName?: string | null;
}

export interface QuotaStatus {
  quota: number;
  used: number;
  remaining: number;
  tier: "FREE" | "STARTER" | "AGENCY";
}
