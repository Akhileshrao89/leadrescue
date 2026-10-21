# LeadRescue — Master Implementation Roadmap (Phases 0–15)

> **Document Version**: 1.0.0  
> **Status**: Approved for Implementation (Phase 1)

---

## 1. Overview & Phased Execution Strategy

LeadRescue follows a strictly phased engineering methodology. Each phase represents a self-contained, testable milestone. Infrastructure is introduced progressively based on proven requirements rather than speculative architecture.

```mermaid
flowchart LR
    P0["P0: Setup & Plan"] --> P1["P1: Spec & Model"]
    P1 --> P2["P2: Frontend Foundation"]
    P2 --> P3["P3: Database & Auth"]
    P3 --> P4["P4: Multi-Tenancy & RLS"]
    P4 --> P5["P5: Lead Management"]
    P5 --> P6["P6: CSV Import"]
    P6 --> P7["P7: Reminders & Outbox"]
    P7 --> P8["P8: AI Drafting"]
    P8 --> P9["P9: Billing & Subscriptions"]
    P9 --> P10["P10: Rate Limiting & Security"]
    P10 --> P11["P11: Performance & Caching"]
    P11 --> P12["P12: Testing & Observability"]
    P12 --> P13["P13: Deployment & CI/CD"]
    P13 --> P14["P14: Scaling Milestones"]
    P14 --> P15["P15: Release Audit"]
```

---

## 2. Phase-by-Phase Execution Breakdown

### Phase 0 — Repository Inspection & Project Scaffold _(Completed)_

- **Prerequisites**: Node.js 20+, npm.
- **Deliverables**: Next.js 16 App Router initialized with TypeScript strict mode, Tailwind CSS v4, ESLint, Prettier, Vitest configuration, `.env.example`, and `README.md`.
- **Acceptance Criteria**: `next build`, `tsc --noEmit`, `eslint`, and `vitest run` all execute with exit code 0.
- **Status**: ✅ **COMPLETE**.

---

### Phase 1 — Product Specification & Domain Model _(Current)_

- **Prerequisites**: Phase 0.
- **Deliverables**: 7 foundational architecture documents in `/docs` detailing entities, invariants, DDL schema, API contracts, threat model, operational strategy, and execution roadmap.
- **Acceptance Criteria**: All documents complete, mutually consistent, reviewed, and versioned.
- **Status**: 🔄 **READY FOR SIGN-OFF**.

---

### Phase 2 — Project Structure, Configuration & Frontend Foundation

- **Prerequisites**: Phase 1 sign-off.
- **Deliverables**:
  - Modular project layout: `src/features/`, `src/components/`, `src/lib/`, `src/server/`.
  - Accessible UI primitives: Button, Input, Table, Dialog, Badge, Alert, Card.
  - Responsive Dashboard Shell: Sidebar navigation, workspace switcher, user profile header, mobile drawer.
  - Zod environment variable runtime validation at app startup (`src/lib/env.ts`).
  - Error boundaries, loading skeletons, and accessible 404 handler.
- **Acceptance Criteria**: Dashboard shell renders responsively on mobile and desktop; all forms pass accessibility (a11y) standards; build passes with zero server-only bundle leaks.
- **Test Strategy**: Component unit tests and accessibility audits via Vitest.

---

### Phase 3 — Database Schema, Migrations & Authentication

- **Prerequisites**: Phase 2, active Supabase project.
- **Deliverables**:
  - Version-controlled SQL migration scripts in `supabase/migrations/`.
  - Supabase SSR cookie authentication integration (`@supabase/ssr`).
  - Public authentication pages: Login, Sign-up, Forgot Password, Workspace Onboarding.
  - Session verification middleware guarding protected `/(dashboard)` routes.
- **Acceptance Criteria**: Clean migration execution on PostgreSQL; sign-up and login securely set HTTP-only session cookies; unauthenticated requests are safely redirected.
- **Test Strategy**: Auth flow unit and integration tests with mocked and real Supabase client.

---

### Phase 4 — Multi-Tenancy, Authorization & RLS

- **Prerequisites**: Phase 3.
- **Deliverables**:
  - Row Level Security (RLS) policies enabled across all tenant tables.
  - Server-side RBAC guard (`verifyWorkspaceMembership(user, role)`).
  - Cross-tenant security testing harness.
- **Acceptance Criteria**: User A cannot read or mutate User B's workspace data even with known UUIDs; Members cannot perform Owner actions; anonymous requests rejected.
- **Test Strategy**: Cross-tenant matrix test suite querying PostgreSQL under representative tenant credentials.

---

### Phase 5 — Lead Management & Core APIs

- **Prerequisites**: Phase 4.
- **Deliverables**:
  - Full Lead CRUD Server Actions (`createLead`, `updateLead`, `archiveLead`, `deleteLead`).
  - Stage state machine validation (`NEW` $\rightarrow$ `CONTACTED` $\rightarrow$ `QUALIFIED` $\rightarrow$ `PROPOSAL` $\rightarrow$ `WON`/`LOST`).
  - Dashboard Follow-Up Queues: Overdue, Due Today, Upcoming, and Unscheduled.
  - Lead Activity timeline logging with optimistic UI updates.
- **Acceptance Criteria**: User can create a lead, assign a follow-up date, see it appear in Due Today, log notes, and advance stages with immediate timeline reflection.
- **Test Strategy**: Business logic unit tests on stage transitions; end-to-end flow test for the core daily agency journey.

---

### Phase 6 — CSV Import Pipeline & Data Integrity

- **Prerequisites**: Phase 5.
- **Deliverables**:
  - CSV file upload component with drag-and-drop and 10MB limit.
  - Column mapping wizard matching CSV headers to Lead schema.
  - Bounded batch ingestion worker with duplicate resolution (`SKIP`, `UPDATE`, `CONFLICT_REPORT`).
  - Formula injection sanitization on CSV export.
  - Import summary view and downloadable failure error report.
- **Acceptance Criteria**: 1,000-row CSV imported without blocking the main event loop; duplicates handled according to selected policy; invalid rows isolated in `import_row_results`.
- **Test Strategy**: Unit tests for malformed CSVs, formula injection, and duplicate email variations.

---

### Phase 7 — Follow-Up Queue, Reminders & Background Jobs

- **Prerequisites**: Phase 5.
- **Deliverables**:
  - PostgreSQL-backed transactional outbox queue (`outbox_events`).
  - Background worker processing with `FOR UPDATE SKIP LOCKED` concurrency control.
  - Exponential backoff with jitter and dead-letter queue.
  - Resend transactional email integration for overdue follow-up alerts.
- **Acceptance Criteria**: Worker claims jobs safely without concurrency locks; crashed worker jobs recover via lease expiration; duplicate reminders prevented via unique idempotency keys.
- **Test Strategy**: Worker failure and lease expiration simulation tests.

---

### Phase 8 — AI-Assisted Message Drafting

- **Prerequisites**: Phase 5.
- **Deliverables**:
  - Provider-agnostic AI drafting service (`generateFollowUpDraft`).
  - Deterministic boilerplate templates for instant fallback without external API calls.
  - Strict input sanitization guarding against prompt injection.
  - Workspace-level monthly quota tracking.
- **Acceptance Criteria**: Templates generate in < 10ms; AI draft requires human approval and editing before copying/sending; prompt injection in lead notes does not leak system instructions.
- **Test Strategy**: Security injection test cases; quota limit enforcement unit tests.

---

### Phase 9 — Billing & Plan Entitlements

- **Prerequisites**: Phase 5.
- **Deliverables**:
  - Tiered plan definitions: Free (100 leads), Starter (500 leads), Agency (2,500 leads).
  - Stripe Checkout and Customer Billing Portal integration.
  - Webhook Route Handler verifying raw signatures via HMAC-SHA256 (`crypto.timingSafeEqual`).
  - Server-side quota enforcement on lead creation and CSV imports.
- **Acceptance Criteria**: Duplicate webhook events processed idempotently; subscription upgrades immediately unlock higher quotas; expired subscriptions downgrade to read-only gracefully.
- **Test Strategy**: Webhook signature verification tests; boundary tests on plan quotas.

---

### Phase 10 — Rate Limiting, Abuse Prevention & Security

- **Prerequisites**: Phase 9.
- **Deliverables**:
  - Layered rate limiting (IP-based on auth routes, workspace-based on business actions).
  - Security headers (Content-Security-Policy, HSTS, X-Frame-Options).
  - Centralized audit logging redacting sensitive PII.
- **Acceptance Criteria**: Automated abuse tests confirm rate limit triggering (HTTP 429); zero secrets in client bundles; penetration tests confirm zero IDOR vulnerabilities.
- **Test Strategy**: Automated penetration and abuse test scripts.

---

### Phase 11 — Performance, Caching & Scaled Data Access

- **Prerequisites**: Phase 10.
- **Deliverables**:
  - Query plan optimization using `EXPLAIN ANALYZE` on composite indexes.
  - Keyset cursor pagination for lead directories.
  - Evaluated introduction of Upstash Redis (strictly if horizontal multi-instance rate limiting warrants it).
- **Acceptance Criteria**: Dashboard p95 query latency < 120ms with 50,000 active leads; keyset queries show index-only scans.
- **Test Strategy**: Load testing and query execution plan verification.

---

### Phase 12 — Testing, Observability & Hardening

- **Prerequisites**: Phases 1–11.
- **Deliverables**:
  - Comprehensive test pyramid (Unit, Integration, Playwright E2E).
  - Sentry / OpenTelemetry structured error tracking.
  - Health check endpoint (`/api/health`) verifying PostgreSQL connectivity.
  - Disaster recovery runbooks.
- **Acceptance Criteria**: Complete daily workflow automated in E2E tests; simulated provider outage triggers appropriate runbook alerts.
- **Test Strategy**: End-to-end headless browser test suites.

---

### Phase 13 — Deployment & CI/CD

- **Prerequisites**: Phase 12.
- **Deliverables**:
  - GitHub Actions CI pipeline executing lint, typecheck, unit tests, and production build.
  - Vercel / Next.js production host deployment setup with isolated staging environment.
  - Supabase migration release checklist and rollback procedures.
- **Acceptance Criteria**: Pull requests blocked if test suite or typecheck fails; staging environment mirrors production configuration.
- **Test Strategy**: Automated deployment verification on staging domain.

---

### Phase 14 — Scaling Roadmap & Engineering Evolution

- **Prerequisites**: Live production telemetry.
- **Deliverables**:
  - Formal scaling milestone documentation (Stage A $\rightarrow$ Stage D).
  - Connection pooling tuning metrics.
  - Horizontal worker decoupling specifications.
- **Acceptance Criteria**: Documented capacity limits and clear trigger criteria for future micro-service or queue separation.

---

### Phase 15 — Final Release Audit

- **Prerequisites**: All prior phases.
- **Deliverables**:
  - Complete engineering release report.
  - Security checklist sign-off.
  - Cost analysis and operational budget reconciliation.
- **Acceptance Criteria**: 100% of acceptance criteria verified; zero known critical vulnerabilities.
