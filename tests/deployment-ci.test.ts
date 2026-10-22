import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Phase 13: Deployment, CI/CD & Migration Integrity", () => {
  const rootDir = path.resolve(__dirname, "..");

  describe("GitHub Actions CI Workflow (.github/workflows/ci.yml)", () => {
    const ciPath = path.join(rootDir, ".github/workflows/ci.yml");

    it("workflow configuration file exists and has content", () => {
      expect(fs.existsSync(ciPath)).toBe(true);
      const content = fs.readFileSync(ciPath, "utf-8");
      expect(content.length).toBeGreaterThan(100);
    });

    it("contains push and pull_request triggers on main branch", () => {
      const content = fs.readFileSync(ciPath, "utf-8");
      expect(content).toContain("push:");
      expect(content).toContain("pull_request:");
      expect(content).toContain("branches: [main]");
    });

    it("enforces all 5 mandatory quality gate verification steps", () => {
      const content = fs.readFileSync(ciPath, "utf-8");
      expect(content).toContain("npm run format:check");
      expect(content).toContain("npm run lint");
      expect(content).toContain("npm run typecheck");
      expect(content).toContain("npm run test");
      expect(content).toContain("npm run build");
    });

    it("configures Node.js 20.x with npm cache", () => {
      const content = fs.readFileSync(ciPath, "utf-8");
      expect(content).toContain("node-version: 20.x");
      expect(content).toContain("cache: npm");
    });
  });

  describe("Vercel Deployment Configuration (vercel.json)", () => {
    const vercelPath = path.join(rootDir, "vercel.json");

    it("vercel.json exists and parses as valid JSON", () => {
      expect(fs.existsSync(vercelPath)).toBe(true);
      const raw = fs.readFileSync(vercelPath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.framework).toBe("nextjs");
    });

    it("configures outbox worker cron job", () => {
      const raw = fs.readFileSync(vercelPath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(Array.isArray(parsed.crons)).toBe(true);
      const outboxCron = parsed.crons.find(
        (c: { path: string }) => c.path === "/api/cron/outbox",
      );
      expect(outboxCron).toBeDefined();
      expect(["0 0 * * *", "0 * * * *"]).toContain(outboxCron.schedule);
    });

    it("applies required security headers across all routes", () => {
      const raw = fs.readFileSync(vercelPath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(Array.isArray(parsed.headers)).toBe(true);

      const globalHeaderEntry = parsed.headers.find(
        (h: { source: string }) => h.source === "/(.*)",
      );
      expect(globalHeaderEntry).toBeDefined();

      const headerKeys = globalHeaderEntry.headers.map(
        (h: { key: string }) => h.key,
      );
      expect(headerKeys).toContain("X-Frame-Options");
      expect(headerKeys).toContain("X-Content-Type-Options");
      expect(headerKeys).toContain("Strict-Transport-Security");
      expect(headerKeys).toContain("Referrer-Policy");
      expect(headerKeys).toContain("Permissions-Policy");
    });
  });

  describe("Supabase Migration Release Sequencing & Rollback Procedures", () => {
    const migrationsDir = path.join(rootDir, "supabase/migrations");
    const migrationFiles = [
      "00001_initial_schema.sql",
      "00002_rbac_and_rls_policies.sql",
      "00003_csv_import_pipeline.sql",
      "00004_reminders_and_outbox.sql",
      "00005_subscriptions_and_ai_quotas.sql",
      "00006_performance_indexes_and_keyset.sql",
    ];

    it("all 6 database migrations exist in sequential order", () => {
      const existingFiles = fs.readdirSync(migrationsDir).sort();
      for (const expectedFile of migrationFiles) {
        expect(existingFiles).toContain(expectedFile);
        const filePath = path.join(migrationsDir, expectedFile);
        const stats = fs.statSync(filePath);
        expect(stats.size).toBeGreaterThan(50);
      }
    });

    it("deployment and migration runbook exists with matching down-scripts", () => {
      const runbookPath = path.join(
        rootDir,
        "docs/deployment-and-migrations.md",
      );
      expect(fs.existsSync(runbookPath)).toBe(true);
      const runbookContent = fs.readFileSync(runbookPath, "utf-8");

      for (const file of migrationFiles) {
        const migrationNumber = file.slice(0, 5);
        expect(runbookContent).toContain(
          `Rollback: Migration ${migrationNumber}`,
        );
      }
    });
  });
});
