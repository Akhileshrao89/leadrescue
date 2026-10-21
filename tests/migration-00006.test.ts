import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Phase 11: Migration 00006 (Performance Indexes & Keyset Scaling)", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../supabase/migrations/00006_performance_indexes_and_keyset.sql",
  );

  it("ensures migration file 00006 exists and is non-empty", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, "utf8");
    expect(content.length).toBeGreaterThan(100);
  });

  it("defines composite keyset index on next_follow_up_at and id", () => {
    const content = fs.readFileSync(migrationPath, "utf8");
    expect(content).toContain("idx_leads_keyset_follow_up");
    expect(content).toContain("next_follow_up_at ASC NULLS LAST");
    expect(content).toContain("id ASC");
  });

  it("defines composite keyset index on stage and created_at", () => {
    const content = fs.readFileSync(migrationPath, "utf8");
    expect(content).toContain("idx_leads_keyset_stage");
    expect(content).toContain("stage");
    expect(content).toContain("created_at DESC");
    expect(content).toContain("id DESC");
  });

  it("defines partial index for instant active count O(1) query", () => {
    const content = fs.readFileSync(migrationPath, "utf8");
    expect(content).toContain("idx_leads_active_count");
    expect(content).toContain("WHERE is_archived = false");
  });

  it("defines outbox lease recovery index for worker resilience", () => {
    const content = fs.readFileSync(migrationPath, "utf8");
    expect(content).toContain("idx_outbox_lease_recovery");
    expect(content).toContain("WHERE status = 'PROCESSING'");
  });
});
