import { describe, it, expect } from "vitest";
import { SECURITY_HEADERS, applySecurityHeaders } from "@/lib/security/headers";

describe("Phase 10: Security Headers Specification", () => {
  it("defines comprehensive Content-Security-Policy header", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://api.stripe.com");
  });

  it("enforces Strict-Transport-Security (HSTS)", () => {
    const hsts = SECURITY_HEADERS["Strict-Transport-Security"];
    expect(hsts).toBeDefined();
    expect(hsts).toContain("max-age=63072000");
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).toContain("preload");
  });

  it("enforces anti-clickjacking via X-Frame-Options DENY", () => {
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
  });

  it("prevents MIME-sniffing via X-Content-Type-Options nosniff", () => {
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("enforces strict referrer policy", () => {
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("restricts dangerous permissions in Permissions-Policy", () => {
    const permissions = SECURITY_HEADERS["Permissions-Policy"];
    expect(permissions).toContain("camera=()");
    expect(permissions).toContain("microphone=()");
    expect(permissions).toContain("geolocation=()");
  });

  it("applies all security headers to a response headers object", () => {
    const headers = new Headers();
    applySecurityHeaders(headers);

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Strict-Transport-Security")).toContain(
      "max-age=63072000",
    );
    expect(headers.get("Content-Security-Policy")).toBeDefined();
  });
});
