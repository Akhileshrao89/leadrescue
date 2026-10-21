# LeadRescue

> High-velocity, multi-tenant lead management and follow-up engine tailored for digital agencies (Web Design, SEO, Lead Gen).

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript (Strict Mode)
- **Styling**: Tailwind CSS
- **Data & Auth**: Supabase PostgreSQL + Supabase Auth (with Row Level Security)
- **Form & Validation**: Zod + React Hook Form
- **Testing**: Vitest
- **Code Quality**: ESLint + Prettier

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js**: `v20.x` or later (tested on v23)
- **npm**: `v10.x` or later
- A Supabase account / project or local Supabase CLI

### 2. Setup Environment Variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your Supabase project credentials (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`).

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🧪 Available Scripts

| Script                 | Purpose                                        |
| :--------------------- | :--------------------------------------------- |
| `npm run dev`          | Starts local Next.js development server        |
| `npm run build`        | Compiles production build                      |
| `npm run start`        | Runs compiled production build                 |
| `npm run lint`         | Runs ESLint                                    |
| `npm run typecheck`    | Validates TypeScript types across the codebase |
| `npm run test`         | Runs unit tests with Vitest                    |
| `npm run format`       | Auto-formats code with Prettier                |
| `npm run format:check` | Verifies code formatting compliance            |

---

## 🔒 Security Principles

1. **Strict Multi-Tenancy**: Every agency resource (leads, activities, imports, reminders) belongs to a workspace (`workspace_id`).
2. **Defense-in-Depth**: Authorization checks are performed both at the application/API layer and enforced via PostgreSQL Row Level Security (RLS).
3. **No Credential Leaks**: Privileged database keys (`SUPABASE_SERVICE_ROLE_KEY`) are server-only and excluded from client bundles.
4. **Zero Untrusted Input**: Strict Zod schemas guard all route handlers, actions, and background jobs.
