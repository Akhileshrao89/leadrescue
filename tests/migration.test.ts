import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Database Migration Verification", () => {
  const migration1Path = path.resolve(
    __dirname,
    "../supabase/migrations/00001_initial_schema.sql",
  );
  const migration2Path = path.resolve(
    __dirname,
    "../supabase/migrations/00002_rbac_and_rls_policies.sql",
  );
  const migration3Path = path.resolve(
    __dirname,
    "../supabase/migrations/00003_csv_import_pipeline.sql",
  );
  const migration4Path = path.resolve(
    __dirname,
    "../supabase/migrations/00004_reminders_and_outbox.sql",
  );
  const migration5Path = path.resolve(
    __dirname,
    "../supabase/migrations/00005_subscriptions_and_ai_quotas.sql",
  );

  describe("00001_initial_schema.sql", () => {
    it("ensures 00001_initial_schema.sql exists and is non-empty", () => {
      expect(fs.existsSync(migration1Path)).toBe(true);
      const content = fs.readFileSync(migration1Path, "utf-8");
      expect(content.length).toBeGreaterThan(500);
    });

    it("verifies DDL contains all required tables and relationships", () => {
      const content = fs.readFileSync(migration1Path, "utf-8");

      // Required tables
      expect(content).toContain("CREATE TABLE IF NOT EXISTS public.profiles");
      expect(content).toContain("CREATE TABLE IF NOT EXISTS public.workspaces");
      expect(content).toContain(
        "CREATE TABLE IF NOT EXISTS public.memberships",
      );
      expect(content).toContain("CREATE TABLE IF NOT EXISTS public.leads");
      expect(content).toContain(
        "CREATE TABLE IF NOT EXISTS public.lead_activities",
      );

      // Foreign keys with explicit ON DELETE
      expect(content).toContain(
        "REFERENCES public.workspaces(id) ON DELETE CASCADE",
      );
      expect(content).toContain(
        "REFERENCES public.profiles(id) ON DELETE CASCADE",
      );
      expect(content).toContain(
        "REFERENCES public.leads(id) ON DELETE CASCADE",
      );

      // Check constraints
      expect(content).toContain("CONSTRAINT ck_contact_present CHECK");
      expect(content).toContain("uq_leads_workspace_email");
    });

    it("verifies Row Level Security (RLS) is enabled on all tenant tables", () => {
      const content = fs.readFileSync(migration1Path, "utf-8");

      expect(content).toContain(
        "ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY",
      );
      expect(content).toContain(
        "ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY",
      );
      expect(content).toContain(
        "ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY",
      );
      expect(content).toContain(
        "ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY",
      );
      expect(content).toContain(
        "ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY",
      );

      // Helper function
      expect(content).toContain("FUNCTION public.is_workspace_member");
    });

    it("verifies atomic workspace onboarding procedure is defined", () => {
      const content = fs.readFileSync(migration1Path, "utf-8");
      expect(content).toContain("FUNCTION public.create_workspace_for_user");
    });
  });

  describe("00002_rbac_and_rls_policies.sql", () => {
    it("ensures 00002_rbac_and_rls_policies.sql exists and defines has_workspace_role", () => {
      expect(fs.existsSync(migration2Path)).toBe(true);
      const content = fs.readFileSync(migration2Path, "utf-8");
      expect(content.length).toBeGreaterThan(200);

      // Role check helper function
      expect(content).toContain("FUNCTION public.has_workspace_role");
      expect(content).toContain("SECURITY DEFINER");
      expect(content).toContain("SET search_path = public");
    });

    it("verifies RLS policies enforce RBAC for memberships, workspaces, and leads", () => {
      const content = fs.readFileSync(migration2Path, "utf-8");

      // Memberships policies
      expect(content).toContain(
        'CREATE POLICY "Admins and Owners can insert memberships"',
      );
      expect(content).toContain(
        'CREATE POLICY "Admins and Owners can update memberships"',
      );
      expect(content).toContain(
        'CREATE POLICY "Admins and Owners can delete memberships"',
      );

      // Workspace deletion restricted to OWNER
      expect(content).toContain('CREATE POLICY "Owners can delete workspace"');
      expect(content).toContain(
        "public.has_workspace_role(id, ARRAY['OWNER'::user_role])",
      );

      // Lead deletion restricted to OWNER and ADMIN
      expect(content).toContain(
        'CREATE POLICY "Admins and Owners can delete workspace leads"',
      );
    });
  });

  describe("00003_csv_import_pipeline.sql", () => {
    it("ensures 00003_csv_import_pipeline.sql exists and defines import tables", () => {
      expect(fs.existsSync(migration3Path)).toBe(true);
      const content = fs.readFileSync(migration3Path, "utf-8");
      expect(content.length).toBeGreaterThan(300);

      expect(content).toContain(
        "CREATE TABLE IF NOT EXISTS public.import_jobs",
      );
      expect(content).toContain(
        "CREATE TABLE IF NOT EXISTS public.import_row_results",
      );
      expect(content).toContain(
        "REFERENCES public.workspaces(id) ON DELETE CASCADE",
      );
      expect(content).toContain(
        "REFERENCES public.import_jobs(id) ON DELETE CASCADE",
      );
    });

    it("verifies RLS and policies on import tables", () => {
      const content = fs.readFileSync(migration3Path, "utf-8");

      expect(content).toContain(
        "ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY",
      );
      expect(content).toContain(
        "ALTER TABLE public.import_row_results ENABLE ROW LEVEL SECURITY",
      );
      expect(content).toContain(
        'CREATE POLICY "Workspace members can view import jobs"',
      );
      expect(content).toContain(
        'CREATE POLICY "Workspace members can view import row results"',
      );
    });
  });

  describe("00004_reminders_and_outbox.sql", () => {
    it("ensures 00004_reminders_and_outbox.sql exists and defines reminders and outbox tables", () => {
      expect(fs.existsSync(migration4Path)).toBe(true);
      const content = fs.readFileSync(migration4Path, "utf-8");
      expect(content.length).toBeGreaterThan(500);

      expect(content).toContain("CREATE TABLE IF NOT EXISTS public.reminders");
      expect(content).toContain(
        "CREATE TABLE IF NOT EXISTS public.outbox_events",
      );
      expect(content).toContain(
        "REFERENCES public.workspaces(id) ON DELETE CASCADE",
      );
      expect(content).toContain(
        "REFERENCES public.leads(id) ON DELETE CASCADE",
      );
      expect(content).toContain("idempotency_key VARCHAR(100) NOT NULL UNIQUE");
      expect(content).toContain("lease_token UUID");
      expect(content).toContain("lease_expires_at TIMESTAMPTZ");
    });

    it("verifies partial indexes for high-throughput zero-lock worker dispatch", () => {
      const content = fs.readFileSync(migration4Path, "utf-8");

      expect(content).toContain("idx_reminders_due_dispatch");
      expect(content).toContain("WHERE status = 'QUEUED'");
      expect(content).toContain("idx_outbox_unprocessed");
      expect(content).toContain("WHERE status = 'QUEUED'");
    });

    it("verifies RLS policies and claim_outbox_batch SKIP LOCKED procedure", () => {
      const content = fs.readFileSync(migration4Path, "utf-8");

      expect(content).toContain(
        "ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY",
      );
      expect(content).toContain(
        "ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY",
      );
      expect(content).toContain(
        'CREATE POLICY "Workspace members can view reminders"',
      );
      expect(content).toContain(
        'CREATE POLICY "Workspace members can view outbox events"',
      );

      // FOR UPDATE SKIP LOCKED stored procedure
      expect(content).toContain("FUNCTION public.claim_outbox_batch");
      expect(content).toContain("FOR UPDATE SKIP LOCKED");
      expect(content).toContain("SECURITY DEFINER");
    });
  });

  describe("00005_subscriptions_and_ai_quotas.sql", () => {
    it("ensures 00005_subscriptions_and_ai_quotas.sql exists and defines subscriptions table", () => {
      expect(fs.existsSync(migration5Path)).toBe(true);
      const content = fs.readFileSync(migration5Path, "utf-8");
      expect(content.length).toBeGreaterThan(500);

      expect(content).toContain(
        "CREATE TABLE IF NOT EXISTS public.subscriptions",
      );
      expect(content).toContain(
        "REFERENCES public.workspaces(id) ON DELETE CASCADE",
      );
      expect(content).toContain(
        "monthly_ai_drafts_quota INTEGER NOT NULL DEFAULT 20",
      );
      expect(content).toContain("ai_drafts_used INTEGER NOT NULL DEFAULT 0");
      expect(content).toContain(
        "tier subscription_tier NOT NULL DEFAULT 'FREE'",
      );
    });

    it("verifies RLS policies and atomic AI quota procedures", () => {
      const content = fs.readFileSync(migration5Path, "utf-8");

      expect(content).toContain(
        "ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY",
      );
      expect(content).toContain(
        'CREATE POLICY "Workspace members can view subscriptions"',
      );
      expect(content).toContain("FUNCTION public.check_and_consume_ai_quota");
      expect(content).toContain("FUNCTION public.get_workspace_ai_quota");
      expect(content).toContain("FOR UPDATE");
    });
  });
});
