import { Lead, LeadActivity, LeadStage, FollowUpQueueType } from "./types";
import {
  OutboxEvent,
  Reminder,
  ReminderFilterOptions,
} from "@/features/reminders/types";
import { filterLeads } from "./lead-filter";
import { calculateNextAvailableAt } from "@/features/reminders/backoff";
import { MOCK_LEADS } from "./fixtures";
import crypto from "node:crypto";

export interface DemoStoreListLeadsOptions {
  search?: string;
  stage?: LeadStage | "ALL";
  queue?: FollowUpQueueType | "ALL";
  cursor?: string | null;
  limit?: number;
  sortBy?: "created_at" | "next_follow_up_at";
  sortDirection?: "asc" | "desc";
}

export interface DemoStoreListLeadsResult {
  leads: Lead[];
  nextCursor: string | null;
  hasMore: boolean;
  totalActiveCount: number;
}

class DemoStore {
  private leads: Lead[] = [];
  private activities: LeadActivity[] = [];
  private reminders: Reminder[] = [];
  private outboxEvents: OutboxEvent[] = [];
  private initialized = false;

  constructor() {
    this.init();
  }

  public init(initialLeads?: Lead[]) {
    this.leads = initialLeads ? [...initialLeads] : [...MOCK_LEADS];
    this.activities = [];
    this.reminders = [];
    this.outboxEvents = [];
    this.initialized = true;

    // Seed initial demo reminder and outbox event for the first overdue lead
    const overdueLead = this.leads.find((l) => l.id === "demo-lead-001");
    if (overdueLead && overdueLead.nextFollowUpAt) {
      const reminderId = "rem_demo_overdue_001";
      this.reminders.push({
        id: reminderId,
        workspaceId: overdueLead.workspaceId,
        leadId: overdueLead.id,
        recipientUserId: "usr_demo_agency_owner",
        dueAt: overdueLead.nextFollowUpAt,
        status: "QUEUED",
        idempotencyKey: `rem_idem_${overdueLead.id}_${overdueLead.nextFollowUpAt}`,
        sentAt: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      this.outboxEvents.push({
        id: "evt_demo_outbox_001",
        workspaceId: overdueLead.workspaceId,
        jobType: "send_lead_reminder",
        payload: {
          reminderId,
          leadId: overdueLead.id,
          workspaceId: overdueLead.workspaceId,
          recipientUserId: "usr_demo_agency_owner",
          dueAt: overdueLead.nextFollowUpAt,
          leadName:
            `${overdueLead.firstName} ${overdueLead.lastName || ""}`.trim(),
          leadEmail: overdueLead.email || undefined,
          companyName: overdueLead.companyName || undefined,
        },
        status: "QUEUED",
        attempts: 0,
        maxAttempts: 5,
        availableAt: overdueLead.nextFollowUpAt,
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  public reset(initialLeads?: Lead[]) {
    this.init(initialLeads);
  }

  // ==========================================
  // LEADS
  // ==========================================

  public listLeads(
    options: DemoStoreListLeadsOptions = {},
  ): DemoStoreListLeadsResult {
    const active = this.leads.filter((l) => !l.isArchived);
    const filtered = filterLeads(active, {
      search: options.search,
      stage: options.stage,
      queue: options.queue,
    });

    const sortBy = options.sortBy || "next_follow_up_at";
    const ascending = options.sortDirection !== "desc";

    filtered.sort((a, b) => {
      const valA =
        (sortBy === "created_at" ? a.createdAt : a.nextFollowUpAt) || "";
      const valB =
        (sortBy === "created_at" ? b.createdAt : b.nextFollowUpAt) || "";
      if (valA === valB) return 0;
      if (!valA) return 1;
      if (!valB) return -1;
      return ascending ? (valA < valB ? -1 : 1) : valA > valB ? -1 : 1;
    });

    const limit = Math.max(1, Math.min(100, options.limit || 25));

    // Handle cursor pagination
    let startIndex = 0;
    if (options.cursor) {
      try {
        const decoded = Buffer.from(options.cursor, "base64url").toString(
          "utf-8",
        );
        const parsed = JSON.parse(decoded);
        const idx = filtered.findIndex((l) => l.id === parsed.id);
        if (idx !== -1) {
          startIndex = idx + 1;
        }
      } catch {
        startIndex = 0;
      }
    }

    const pageLeads = filtered.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filtered.length;

    let nextCursor: string | null = null;
    if (hasMore && pageLeads.length > 0) {
      const lastLead = pageLeads[pageLeads.length - 1];
      const sortValue =
        sortBy === "created_at" ? lastLead.createdAt : lastLead.nextFollowUpAt;
      nextCursor = Buffer.from(
        JSON.stringify({ id: lastLead.id, sortValue }),
      ).toString("base64url");
    }

    return {
      leads: pageLeads,
      nextCursor,
      hasMore,
      totalActiveCount: active.length,
    };
  }

  public getLead(id: string): Lead | undefined {
    return this.leads.find((l) => l.id === id);
  }

  public addLead(data: Partial<Lead> & { firstName: string }): Lead {
    const id = data.id || `lead_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const newLead: Lead = {
      id,
      workspaceId: data.workspaceId || "ws_demo_agency",
      assignedUserId: data.assignedUserId || "usr_demo_agency_owner",
      firstName: data.firstName,
      lastName: data.lastName || null,
      email: data.email ? data.email.toLowerCase().trim() : null,
      phone: data.phone ? data.phone.trim() : null,
      companyName: data.companyName ? data.companyName.trim() : null,
      website: data.website ? data.website.trim() : null,
      stage: data.stage || "NEW",
      source: data.source || "manual",
      notes: data.notes || null,
      lastContactedAt: data.lastContactedAt || null,
      nextFollowUpAt: data.nextFollowUpAt || null,
      isArchived: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.leads.unshift(newLead);
    return newLead;
  }

  public updateLead(id: string, updates: Partial<Lead>): Lead | null {
    const idx = this.leads.findIndex((l) => l.id === id);
    if (idx === -1) return null;

    const current = this.leads[idx];
    const updated: Lead = {
      ...current,
      ...updates,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };

    this.leads[idx] = updated;
    return updated;
  }

  public deleteLead(id: string): boolean {
    const idx = this.leads.findIndex((l) => l.id === id);
    if (idx === -1) return false;
    this.leads[idx].isArchived = true;
    this.leads[idx].updatedAt = new Date().toISOString();
    return true;
  }

  // ==========================================
  // ACTIVITIES
  // ==========================================

  public addActivity(
    activity: Omit<LeadActivity, "id" | "createdAt">,
  ): LeadActivity {
    const record: LeadActivity = {
      ...activity,
      id: `act_${crypto.randomUUID().slice(0, 8)}`,
      createdAt: new Date().toISOString(),
    };
    this.activities.unshift(record);
    return record;
  }

  public getActivities(leadId: string): LeadActivity[] {
    return this.activities.filter((a) => a.leadId === leadId);
  }

  // ==========================================
  // REMINDERS & OUTBOX
  // ==========================================

  public scheduleReminder(params: {
    workspaceId: string;
    leadId: string;
    recipientUserId: string;
    dueAt: string;
    leadName?: string;
    leadEmail?: string;
    companyName?: string;
  }): { reminderId: string; eventId: string } {
    // Cancel existing pending reminders for this lead
    for (const rem of this.reminders) {
      if (rem.leadId === params.leadId && rem.status === "QUEUED") {
        rem.status = "CANCELLED";
        rem.errorMessage = "Superseded by new reminder";
        rem.updatedAt = new Date().toISOString();
      }
    }

    const reminderId = `rem_${crypto.randomUUID().slice(0, 8)}`;
    const eventId = `evt_${crypto.randomUUID().slice(0, 8)}`;
    const nowISO = new Date().toISOString();

    const reminder: Reminder = {
      id: reminderId,
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      recipientUserId: params.recipientUserId,
      dueAt: params.dueAt,
      status: "QUEUED",
      idempotencyKey: `idem_${params.leadId}_${params.dueAt}`,
      sentAt: null,
      errorMessage: null,
      createdAt: nowISO,
      updatedAt: nowISO,
    };
    this.reminders.push(reminder);

    const outboxEvent: OutboxEvent = {
      id: eventId,
      workspaceId: params.workspaceId,
      jobType: "send_lead_reminder",
      payload: {
        reminderId,
        leadId: params.leadId,
        workspaceId: params.workspaceId,
        recipientUserId: params.recipientUserId,
        dueAt: params.dueAt,
        leadName: params.leadName,
        leadEmail: params.leadEmail,
        companyName: params.companyName,
      },
      status: "QUEUED",
      attempts: 0,
      maxAttempts: 5,
      availableAt: params.dueAt,
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: null,
      createdAt: nowISO,
      updatedAt: nowISO,
    };
    this.outboxEvents.push(outboxEvent);

    return { reminderId, eventId };
  }

  public listReminders(options: ReminderFilterOptions = {}): Reminder[] {
    return this.reminders.filter((rem) => {
      if (
        options.status &&
        options.status !== "ALL" &&
        rem.status !== options.status
      ) {
        return false;
      }
      if (options.leadId && rem.leadId !== options.leadId) {
        return false;
      }
      if (
        options.dueBefore &&
        new Date(rem.dueAt) > new Date(options.dueBefore)
      ) {
        return false;
      }
      return true;
    });
  }

  public cancelReminder(reminderId: string): boolean {
    const rem = this.reminders.find((r) => r.id === reminderId);
    if (!rem) return false;
    rem.status = "CANCELLED";
    rem.updatedAt = new Date().toISOString();
    return true;
  }

  public enqueueOutbox(event: {
    workspaceId: string;
    jobType: string;
    payload: Record<string, unknown>;
    availableAt?: string;
    maxAttempts?: number;
  }): OutboxEvent {
    const id = `evt_${crypto.randomUUID().slice(0, 8)}`;
    const nowISO = new Date().toISOString();
    const newEvent: OutboxEvent = {
      id,
      workspaceId: event.workspaceId,
      jobType: event.jobType,
      payload: event.payload,
      status: "QUEUED",
      attempts: 0,
      maxAttempts: event.maxAttempts ?? 5,
      availableAt: event.availableAt || nowISO,
      leaseToken: null,
      leaseExpiresAt: null,
      lastError: null,
      createdAt: nowISO,
      updatedAt: nowISO,
    };
    this.outboxEvents.push(newEvent);
    return newEvent;
  }

  public claimOutbox(
    batchSize = 10,
    leaseDurationSeconds = 120,
  ): OutboxEvent[] {
    const now = new Date();
    const nowISO = now.toISOString();
    const leaseExpiryISO = new Date(
      now.getTime() + leaseDurationSeconds * 1000,
    ).toISOString();
    const leaseToken = crypto.randomUUID();

    const claimed: OutboxEvent[] = [];

    for (const evt of this.outboxEvents) {
      if (claimed.length >= batchSize) break;

      const isReady =
        (evt.status === "QUEUED" && new Date(evt.availableAt) <= now) ||
        (evt.status === "PROCESSING" &&
          evt.leaseExpiresAt &&
          new Date(evt.leaseExpiresAt) < now);

      if (isReady) {
        evt.status = "PROCESSING";
        evt.leaseToken = leaseToken;
        evt.leaseExpiresAt = leaseExpiryISO;
        evt.updatedAt = nowISO;
        claimed.push(evt);
      }
    }

    return claimed;
  }

  public completeOutbox(id: string): boolean {
    const evt = this.outboxEvents.find((e) => e.id === id);
    if (!evt) return false;

    evt.status = "COMPLETED";
    evt.leaseToken = null;
    evt.leaseExpiresAt = null;
    evt.updatedAt = new Date().toISOString();

    // Mark corresponding reminder SENT if applicable
    const reminderId = (evt.payload as Record<string, unknown>)?.reminderId as
      string | undefined;
    if (reminderId) {
      const rem = this.reminders.find((r) => r.id === reminderId);
      if (rem) {
        rem.status = "SENT";
        rem.sentAt = new Date().toISOString();
        rem.updatedAt = new Date().toISOString();
      }
    }

    return true;
  }

  public failOutbox(id: string, errorMessage: string): { deadLetter: boolean } {
    const evt = this.outboxEvents.find((e) => e.id === id);
    if (!evt) return { deadLetter: false };

    evt.attempts += 1;
    evt.lastError = errorMessage;
    evt.leaseToken = null;
    evt.leaseExpiresAt = null;
    evt.updatedAt = new Date().toISOString();

    if (evt.attempts >= evt.maxAttempts) {
      evt.status = "DEAD_LETTER";
      return { deadLetter: true };
    }

    // Exponential backoff
    const nextAvailable = calculateNextAvailableAt(evt.attempts - 1, {
      baseSeconds: 1, // Short backoff for swift testing/demo
      enableJitter: false,
    });
    evt.availableAt = nextAvailable.toISOString();
    evt.status = "QUEUED";

    return { deadLetter: false };
  }

  public getOutboxEvent(id: string): OutboxEvent | undefined {
    return this.outboxEvents.find((e) => e.id === id);
  }
}

// Global process-level singleton to survive multiple Server Action calls
const globalForDemoStore = globalThis as unknown as {
  __demoStore?: DemoStore;
};

export const demoStore = globalForDemoStore.__demoStore ?? new DemoStore();
if (process.env.NODE_ENV !== "production") {
  globalForDemoStore.__demoStore = demoStore;
}
