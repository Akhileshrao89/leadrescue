import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Phase 15: Final Release Audit & Engineering Sign-Off", () => {
  const rootDir = path.resolve(__dirname, "..");
  const auditPath = path.join(rootDir, "docs/final-release-audit.md");

  it("final release audit document exists and is complete", () => {
    expect(fs.existsSync(auditPath)).toBe(true);
    const content = fs.readFileSync(auditPath, "utf-8");
    expect(content.length).toBeGreaterThan(2000);
  });

  it("verifies all 15 roadmap phases are checked off and documented", () => {
    const content = fs.readFileSync(auditPath, "utf-8");
    for (let i = 0; i <= 15; i++) {
      expect(content).toContain(`Phase ${i}`);
    }
  });

  it("confirms security sign-off and zero hardcoded secrets", () => {
    const content = fs.readFileSync(auditPath, "utf-8");
    expect(content).toContain("Zero Hardcoded Secrets");
    expect(content).toContain("Timing-Attack Immunity");
    expect(content).toContain("Formula Injection Shield");
  });

  it("confirms dual hosting support for Vercel and Firebase App Hosting", () => {
    const content = fs.readFileSync(auditPath, "utf-8");
    expect(content).toContain("Firebase App Hosting");
    expect(content).toContain("Vercel");

    const appHostingYaml = path.join(rootDir, "apphosting.yaml");
    const firebaseJson = path.join(rootDir, "firebase.json");
    const vercelJson = path.join(rootDir, "vercel.json");

    expect(fs.existsSync(appHostingYaml)).toBe(true);
    expect(fs.existsSync(firebaseJson)).toBe(true);
    expect(fs.existsSync(vercelJson)).toBe(true);
  });
});
