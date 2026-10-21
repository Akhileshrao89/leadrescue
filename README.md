# LeadRescue

**LeadRescue** is a follow-up action layer built for boutique web design, SEO, and lead-gen agencies. It solves a specific problem: qualified inbound inquiries and quotes going cold because account managers get buried in delivery work.

Instead of a generic CRM or a passive reminder list, LeadRescue operates as a transactional execution engine: it monitors deal inactivity, calculates stall risk from real prospect objections and overdue dates, and routes follow-ups through a durable background outbox queue with automatic exponential backoff.

---

## 🏗️ Architecture & Core Components

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Next.js 16 (App Router)                         │
│   Dashboard Shell  •  Keyset Lead Table  •  Agentic Mission Control    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                  Server Actions & Middleware (RBAC)
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼                                                   ▼
┌──────────────────────────┐                        ┌──────────────────┐
│   PostgreSQL / Supabase   │                        │  Resend Transmit │
│  • Workspaces (Multi-ten)│                        │  • SMTP Webhook  │
│  • Leads & Audit Trail   │                        │  • 1-Click Send  │
│  • Outbox Queue (Leased) │                        └─────────┬────────┘
│  • RLS Security Policies │                                  │
└─────────┬────────────────┘                                  │
          │                                                   │
          ▼                                                   │
┌──────────────────────────┐                                  │
│ Background Outbox Worker ├──────────────────────────────────┘
│ • FOR UPDATE SKIP LOCKED │ (Transactional Delivery & Retry)
│ • Exponential Backoff    │
└──────────────────────────┘
```

1. **Multi-Tenant Workspace Isolation**: Every query and mutation is partitioned by `workspace_id` with defense-in-depth enforcement: application-layer RBAC (`OWNER`, `ADMIN`, `MEMBER`) paired with PostgreSQL Row Level Security (RLS) policies.
2. **Deterministic State Machine**: Validates all stage transitions (`NEW` → `CONTACTED` → `QUALIFIED` → `PROPOSAL` → `WON` / `LOST`) and prevents invalid backwards regressions.
3. **Durable Transactional Outbox**: Follow-up reminders are inserted as pending outbox events within the same database transaction. The background worker claims ready events using `FOR UPDATE SKIP LOCKED` lease-locking to prevent duplicate sends across concurrent instances.
4. **Resilient Retry & Backoff**: Upstream email delivery failures (e.g., SMTP drops, API limits) automatically increment attempt counters and reschedule the event using exponential backoff with randomized jitter (`available_at = now + 2^attempt * base + jitter`).
5. **Keyset Cursor Pagination**: Directory queries use index-backed composite seeks `(created_at, id)` instead of high-latency `OFFSET` queries, guaranteeing $O(1)$ page fetches even at high record volume.
6. **Dual Hosting Support**: Native deployment support for both **Firebase App Hosting** (`apphosting.yaml`, `firebase.json` Next.js SSR runtime) and **Vercel** (`vercel.json` 1-minute cron triggers).

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16.4.2 (Turbopack, App Router, React 19)
- **Language**: TypeScript 5 (Strict Mode, `noImplicitAny`)
- **Styling & UI**: Tailwind CSS, Radix UI primitives, Lucide Icons
- **Database & Auth**: PostgreSQL (Supabase) with RLS + SSR Cookie Auth
- **Validation**: Zod schema validation on all inputs, CSV rows, and webhook payloads
- **Email Provider**: Resend API
- **Testing**: Vitest (40 test files, 267 unit/integration tests)
- **Code Quality**: ESLint 9 + Prettier

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/Akhileshrao89/leadrescue.git
cd leadrescue
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Set your configuration:

```ini
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"

# Supabase
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon-key>"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# Email (Resend)
RESEND_API_KEY="re_..."
EMAIL_FROM="LeadRescue <onboarding@resend.dev>"

# Background Worker
CRON_SECRET="your-secure-cron-secret"
```

> **Zero-Config Demo Mode**: If external Supabase keys are left unset, the application automatically boots into in-memory persistence mode (`demoStore`), allowing full testing of CSV imports, pagination, lead editing, agent recommendations, and outbox worker ticks without external dependencies.

### 3. Run Database Migrations

Apply the migration files in `supabase/migrations/` (or run `supabase/migrations/all_migrations.sql` in your Supabase SQL Editor):

1. `00001_initial_schema.sql` — Core workspaces, users, leads, activities
2. `00002_rbac_and_rls_policies.sql` — Multi-tenant RLS policies
3. `00003_csv_import_pipeline.sql` — Ingestion tables and failure isolation
4. `00004_reminders_and_outbox.sql` — Outbox queue and lease-lock RPC
5. `00005_subscriptions_and_ai_quotas.sql` — Billing tiers and usage quotas
6. `00006_performance_indexes_and_keyset.sql` — Keyset pagination composite indexes

### 4. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🧪 Testing & Verification

Run the test suite:

```bash
# Run all 267 unit and integration tests
npm test

# Run TypeScript typecheck
npm run typecheck

# Run ESLint
npm run lint

# Check formatting
npm run format:check

# Run Next.js production build
npm run build
```

### End-to-End Test Fixtures

Two realistic agency test datasets are included in `fixtures/`:

- `fixtures/50-agency-leads.csv`: 50 diverse agency prospects (roofing, dentists, med spas, boutique law firms) with real pipeline stages and objection notes.
- `fixtures/10-akhi-codes-stalled-leads.csv`: 10 unpolished real client threads (inbound Twitter DMs, unpaid Stripe invoices, scope creep stalls, offshore freelancer price comparisons).

---

## 📦 Deployment

### Firebase App Hosting (Google Cloud)

Configured via `apphosting.yaml`:

```bash
firebase deploy
```

### Vercel

Includes `vercel.json` with a 1-minute cron worker calling `/api/cron/outbox`:

```bash
vercel --prod
```

---

## 📄 License

MIT License. Built by Akhilesh Rao.
