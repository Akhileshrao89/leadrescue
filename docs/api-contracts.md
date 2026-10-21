# LeadRescue — API Contracts & Server Action Specifications

> **Document Version**: 1.0.0  
> **Status**: Approved for Implementation (Phase 1)

---

## 1. Global API Standards & Conventions

1. **Transport**: Next.js Server Actions for standard interactive UI forms; Next.js Route Handlers (`/api/...`) for webhooks, file stream endpoints, and external background triggers.
2. **Authentication**: All endpoints require an active, verified Supabase SSR session (`auth.users`), returning `401 Unauthorized` if unauthenticated.
3. **Workspace Resolution**: Workspace access is derived from session membership. Client-supplied `workspace_id` parameters are validated against `memberships` table server-side.
4. **Validation**: All payloads are strictly parsed and sanitized using **Zod** schemas.
5. **Standard Error Envelope**:
   ```typescript
   interface ApiErrorResponse {
     success: false;
     error: {
       code:
         | "UNAUTHORIZED"
         | "FORBIDDEN"
         | "NOT_FOUND"
         | "VALIDATION_ERROR"
         | "CONFLICT"
         | "RATE_LIMITED"
         | "INTERNAL_ERROR";
       message: string;
       details?: Record<string, string[]>;
     };
   }
   ```

---

## 2. Lead Management Endpoints

### 2.1 List & Filter Leads (`getLeadsAction`)

- **Type**: Server Action
- **Authorization**: `MEMBER`, `ADMIN`, or `OWNER` of target workspace.
- **Input Schema**:
  ```typescript
  import { z } from "zod";

  export const GetLeadsInputSchema = z.object({
    workspaceId: z.string().uuid(),
    stage: z
      .enum(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"])
      .optional(),
    queue: z
      .enum(["overdue", "due_today", "upcoming", "unscheduled"])
      .optional(),
    search: z.string().max(100).optional(),
    cursor: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(100).default(50),
    isArchived: z.boolean().default(false),
  });
  ```
- **Output Schema**:
  ```typescript
  export interface GetLeadsOutput {
    success: true;
    data: {
      leads: Array<{
        id: string;
        firstName: string;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        companyName: string | null;
        stage: "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "WON" | "LOST";
        nextFollowUpAt: string | null;
        lastContactedAt: string | null;
        assignedUserId: string | null;
        createdAt: string;
      }>;
      nextCursor: string | null;
      hasMore: boolean;
    };
  }
  ```

---

### 2.2 Create Lead (`createLeadAction`)

- **Type**: Server Action
- **Authorization**: `MEMBER`, `ADMIN`, `OWNER`. Verifies active lead count against subscription entitlement.
- **Input Schema**:
  ```typescript
  export const CreateLeadInputSchema = z
    .object({
      workspaceId: z.string().uuid(),
      firstName: z.string().min(1, "First name is required").max(100),
      lastName: z.string().max(100).optional().nullable(),
      email: z
        .string()
        .email("Invalid email format")
        .max(255)
        .optional()
        .nullable(),
      phone: z.string().max(30).optional().nullable(),
      companyName: z.string().max(150).optional().nullable(),
      website: z.string().url("Invalid URL").max(255).optional().nullable(),
      stage: z
        .enum(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"])
        .default("NEW"),
      source: z.string().max(50).default("manual"),
      notes: z.string().max(50000).optional().nullable(),
      nextFollowUpAt: z
        .string()
        .datetime({ offset: true })
        .optional()
        .nullable(),
      assignedUserId: z.string().uuid().optional().nullable(),
    })
    .refine((data) => data.email || data.phone, {
      message: "Either email or phone must be provided",
      path: ["email"],
    });
  ```
- **Output Schema**: Returns newly created lead object.
- **Errors**: `409 Conflict` if active lead with identical email exists in workspace; `403 Forbidden` if workspace active lead quota exceeded.

---

### 2.3 Update Lead Stage & Next Follow-Up (`updateLeadAction`)

- **Type**: Server Action
- **Authorization**: `MEMBER`, `ADMIN`, `OWNER`.
- **Input Schema**:
  ```typescript
  export const UpdateLeadInputSchema = z.object({
    workspaceId: z.string().uuid(),
    leadId: z.string().uuid(),
    expectedVersion: z.number().int().min(1),
    stage: z
      .enum(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"])
      .optional(),
    nextFollowUpAt: z.string().datetime({ offset: true }).optional().nullable(),
    notes: z.string().max(50000).optional().nullable(),
    assignedUserId: z.string().uuid().optional().nullable(),
  });
  ```
- **Concurrency & Invariants**: Enforces optimistic locking using `expectedVersion`. Automatically logs transition in `lead_activities`. Cancels queued reminders if stage transitions to `WON` or `LOST`.

---

## 3. Follow-up & Reminder Actions

### 3.1 Complete Follow-Up (`completeFollowUpAction`)

- **Type**: Server Action
- **Authorization**: `MEMBER`, `ADMIN`, `OWNER`.
- **Input Schema**:
  ```typescript
  export const CompleteFollowUpInputSchema = z.object({
    workspaceId: z.string().uuid(),
    leadId: z.string().uuid(),
    outcomeNote: z.string().min(1).max(5000),
    newStage: z
      .enum(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"])
      .optional(),
    scheduledNextFollowUpAt: z
      .string()
      .datetime({ offset: true })
      .optional()
      .nullable(),
  });
  ```
- **Behavior**:
  1. Sets lead `last_contacted_at = now()`.
  2. Cancels pending reminder for this follow-up.
  3. Appends `FOLLOW_UP_COMPLETED` record into `lead_activities` with `outcomeNote`.
  4. If `scheduledNextFollowUpAt` is provided, schedules new reminder and updates `next_follow_up_at`.

---

### 3.2 Reschedule Follow-Up (`rescheduleFollowUpAction`)

- **Type**: Server Action
- **Input Schema**:
  ```typescript
  export const RescheduleFollowUpInputSchema = z.object({
    workspaceId: z.string().uuid(),
    leadId: z.string().uuid(),
    newDate: z.string().datetime({ offset: true }),
    reason: z.string().max(500).optional(),
  });
  ```

---

## 4. CSV Import API

### 4.1 Initiate Import Job (`/api/workspaces/[wsId]/imports`)

- **Type**: Route Handler (POST, `multipart/form-data`)
- **Authorization**: `ADMIN`, `OWNER`.
- **Validation**:
  - Content-Type: `text/csv`, `application/vnd.ms-excel`.
  - Max size: 10MB.
- **Input Mapping**: Column mapping definition:
  ```typescript
  export const ImportMappingSchema = z.object({
    firstNameCol: z.string(),
    lastNameCol: z.string().optional(),
    emailCol: z.string().optional(),
    phoneCol: z.string().optional(),
    companyCol: z.string().optional(),
    websiteCol: z.string().optional(),
    notesCol: z.string().optional(),
    duplicatePolicy: z
      .enum(["SKIP", "UPDATE", "CONFLICT_REPORT"])
      .default("SKIP"),
  });
  ```
- **Output**: Returns `importJobId` and status `'PROCESSING'`.

---

## 5. AI Follow-Up Draft Generation (`generateFollowUpDraftAction`)

- **Type**: Server Action
- **Authorization**: `MEMBER`, `ADMIN`, `OWNER`.
- **Rate Limit**: Max 10 requests per user per minute; strictly bounded by workspace monthly quota.
- **Input Schema**:
  ```typescript
  export const GenerateDraftInputSchema = z.object({
    workspaceId: z.string().uuid(),
    leadId: z.string().uuid(),
    touchpointType: z.enum([
      "FIRST_TOUCH",
      "POST_DISCOVERY",
      "PROPOSAL_CHECK_IN",
      "RE_ENGAGEMENT",
    ]),
    tone: z.enum(["PROFESSIONAL", "FRIENDLY", "URGENT"]).default("FRIENDLY"),
    useAi: z.boolean().default(false), // If false, returns instant deterministic template
  });
  ```
- **Output Schema**:
  ```typescript
  export interface GenerateDraftOutput {
    success: true;
    data: {
      subject: string;
      body: string;
      isAiGenerated: boolean;
      quotaRemaining: number;
    };
  }
  ```
- **Safety**: Prompt injection defense sanitizes lead notes before forwarding to LLM. Under no circumstance does the endpoint automatically send an email; output is returned to client for user editing and approval.
