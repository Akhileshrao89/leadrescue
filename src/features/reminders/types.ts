export type ReminderStatus = "QUEUED" | "SENT" | "FAILED" | "CANCELLED";

export type OutboxStatus =
  "QUEUED" | "PROCESSING" | "COMPLETED" | "DEAD_LETTER";

export interface Reminder {
  id: string;
  workspaceId: string;
  leadId: string;
  recipientUserId: string;
  dueAt: string;
  status: ReminderStatus;
  idempotencyKey: string;
  sentAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutboxEvent<TPayload = Record<string, unknown>> {
  id: string;
  workspaceId: string;
  jobType: string;
  payload: TPayload;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: string;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SendReminderPayload {
  reminderId: string;
  leadId: string;
  workspaceId: string;
  recipientUserId: string;
  dueAt: string;
  leadName?: string;
  leadEmail?: string;
  companyName?: string;
}

export interface WorkerRunResult {
  claimedCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  deadLetterCount: number;
  durationMs: number;
  errors: Array<{ eventId: string; error: string }>;
}

export interface ReminderFilterOptions {
  status?: ReminderStatus | "ALL";
  dueBefore?: string;
  leadId?: string;
  limit?: number;
}
