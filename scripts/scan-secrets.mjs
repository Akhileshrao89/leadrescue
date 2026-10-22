import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const skipDirs = new Set([
  ".git",
  "node_modules",
  ".next",
  ".vercel",
  "coverage",
  "dist",
  "build",
]);
const skipExts = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".woff",
  ".woff2",
  ".ttf",
  ".map",
]);
const patterns = [
  [
    "OpenAI-style secret key",
    /\bsk-(?:live|test|proj)?-?[A-Za-z0-9_-]{24,}\b/g,
  ],
  ["Stripe secret key", /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/g],
  ["Resend API key", /\bre_[A-Za-z0-9_-]{24,}\b/g],
  ["Stripe webhook secret", /\bwhsec_[A-Za-z0-9]{24,}\b/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["AWS access key ID", /\bAKIA[0-9A-Z]{16}\b/g],
  [
    "Private key material",
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  ],
  [
    "Service role assignment",
    /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']?eyJ[A-Za-z0-9._-]{30,}/g,
  ],
];
const allowedEnvExample = path.join(root, ".env.example");
const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      if (
        full === allowedEnvExample ||
        skipExts.has(path.extname(entry.name).toLowerCase())
      )
        continue;
      if (/^\.env(?:\..+)?$/.test(entry.name)) {
        let isGitIgnored = false;
        try {
          execSync(`git check-ignore "${full}"`, { stdio: "ignore" });
          isGitIgnored = true;
        } catch {}
        if (!isGitIgnored) {
          findings.push(
            `${path.relative(root, full)}: environment file must not be committed`,
          );
        }
        continue;
      }
      let content;
      try {
        content = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      if (content.includes("\u0000")) continue;
      for (const [label, pattern] of patterns) {
        pattern.lastIndex = 0;
        if (pattern.test(content))
          findings.push(`${path.relative(root, full)}: possible ${label}`);
      }
    }
  }
}

walk(root);
if (findings.length) {
  console.error("Potential secret exposure detected:");
  for (const finding of [...new Set(findings)]) console.error(`- ${finding}`);
  process.exit(1);
}
console.log(
  "Secret scan passed for working-tree files. This does not scan Git history.",
);
