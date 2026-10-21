import { describe, it, expect } from "vitest";
import { LeadFormSchema } from "@/features/leads/schema";

describe("LeadFormSchema Validation", () => {
  it("fails if firstName is empty", () => {
    const result = LeadFormSchema.safeParse({
      firstName: "",
      email: "test@example.com",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "First name is required",
      );
    }
  });

  it("fails if neither email nor phone is provided", () => {
    const result = LeadFormSchema.safeParse({
      firstName: "Alex",
      email: "",
      phone: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "At least one contact method (email or phone) is required",
      );
    }
  });

  it("succeeds when valid email is provided", () => {
    const result = LeadFormSchema.safeParse({
      firstName: "Alex",
      email: "alex@agency.com",
    });
    expect(result.success).toBe(true);
  });

  it("succeeds when phone is provided without email", () => {
    const result = LeadFormSchema.safeParse({
      firstName: "Alex",
      email: "",
      phone: "+1 555-1234",
    });
    expect(result.success).toBe(true);
  });

  it("fails on malformed email syntax", () => {
    const result = LeadFormSchema.safeParse({
      firstName: "Alex",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("fails on malformed website URL", () => {
    const result = LeadFormSchema.safeParse({
      firstName: "Alex",
      email: "alex@agency.com",
      website: "ftp-not-http",
    });
    expect(result.success).toBe(false);
  });
});
