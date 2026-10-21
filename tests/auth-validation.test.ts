import { describe, it, expect } from "vitest";
import { z } from "zod";

const SignInSchema = z.object({
  email: z.string().trim().email("Please provide a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const SignUpSchema = z.object({
  email: z.string().trim().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().trim().min(1, "Full name is required").max(100),
  agencyName: z.string().trim().min(1, "Agency name is required").max(100),
});

describe("Authentication Validation Schemas", () => {
  describe("SignInSchema", () => {
    it("validates correct credentials", () => {
      const res = SignInSchema.safeParse({
        email: "agency@example.com",
        password: "secretpassword123",
      });
      expect(res.success).toBe(true);
    });

    it("rejects invalid email address", () => {
      const res = SignInSchema.safeParse({
        email: "not-an-email",
        password: "secretpassword123",
      });
      expect(res.success).toBe(false);
    });

    it("rejects passwords shorter than 6 characters", () => {
      const res = SignInSchema.safeParse({
        email: "agency@example.com",
        password: "123",
      });
      expect(res.success).toBe(false);
    });
  });

  describe("SignUpSchema", () => {
    it("validates valid registration payload", () => {
      const res = SignUpSchema.safeParse({
        email: "founder@apexseo.com",
        password: "securepassword2026",
        fullName: "Alex Rivera",
        agencyName: "Apex SEO Agency",
      });
      expect(res.success).toBe(true);
    });

    it("rejects password shorter than 8 characters", () => {
      const res = SignUpSchema.safeParse({
        email: "founder@apexseo.com",
        password: "short",
        fullName: "Alex Rivera",
        agencyName: "Apex SEO Agency",
      });
      expect(res.success).toBe(false);
    });

    it("rejects empty agency name", () => {
      const res = SignUpSchema.safeParse({
        email: "founder@apexseo.com",
        password: "securepassword2026",
        fullName: "Alex Rivera",
        agencyName: "   ",
      });
      expect(res.success).toBe(false);
    });
  });
});
