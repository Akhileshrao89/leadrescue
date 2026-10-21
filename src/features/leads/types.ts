export type LeadStage =
  "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "WON" | "LOST";

export interface Lead {
  id: string;
  workspaceId: string;
  assignedUserId?: string | null;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  website?: string | null;
  stage: LeadStage;
  source?: string | null;
  notes?: string | null;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  isArchived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  id: string;
  workspaceId: string;
  leadId: string;
  userId?: string | null;
  type:
    | "NOTE_ADDED"
    | "STAGE_CHANGED"
    | "FOLLOW_UP_SCHEDULED"
    | "FOLLOW_UP_COMPLETED"
    | "REMINDER_SENT"
    | "IMPORTED";
  details: Record<string, unknown>;
  createdAt: string;
}

export type FollowUpQueueType =
  "overdue" | "due_today" | "upcoming" | "unscheduled";
