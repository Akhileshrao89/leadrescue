import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Phase 10: Secret Leakage & Bundle Isolation Audit", () => {
  const sensitiveEnvNames = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "RESEND_API_KEY",
  ];

  function getFilesRecursively(dir: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getFilesRecursively(fullPath));
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it("ensures zero references to privileged secrets in client-side components", () => {
    const clientDirs = [
      path.resolve(__dirname, "../src/components"),
      path.resolve(__dirname, "../src/app"),
    ];

    const violations: Array<{ file: string; secret: string }> = [];

    for (const dir of clientDirs) {
      const files = getFilesRecursively(dir);

      for (const file of files) {
        const content = fs.readFileSync(file, "utf8");

        // Only inspect client components or browser files
        const isClientComponent =
          content.includes('"use client"') ||
          content.includes("'use client'") ||
          file.includes("/components/ui/");

        if (isClientComponent) {
          for (const secret of sensitiveEnvNames) {
            // Check direct usage like process.env.SUPABASE_SERVICE_ROLE_KEY
            if (content.includes(secret)) {
              violations.push({
                file: path.relative(process.cwd(), file),
                secret,
              });
            }
          }
        }
      }
    }

    expect(
      violations,
      `Detected server-only secrets leaked into client component files:\n${violations
        .map((v) => `  - ${v.file}: ${v.secret}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("verifies public Supabase client only uses anonymous public keys", () => {
    const clientFile = path.resolve(__dirname, "../src/lib/supabase/client.ts");
    expect(fs.existsSync(clientFile)).toBe(true);

    const content = fs.readFileSync(clientFile, "utf8");
    expect(content).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(content).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });
});
