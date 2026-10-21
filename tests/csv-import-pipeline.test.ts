import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateImportRow,
  executeCsvIngestion,
  type ImportMapping,
} from "@/features/imports/pipeline";
import { initiateCsvImportAction } from "@/features/imports/actions";

// Mock server modules
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock("@/features/workspaces/server", () => ({
  getActiveWorkspaceForUser: vi.fn(),
}));

import { SupabaseClient } from "@supabase/supabase-js";
import { getActiveWorkspaceForUser } from "@/features/workspaces/server";

describe("Phase 6: CSV Ingestion Pipeline & Duplicate Policies", () => {
  const standardMapping: ImportMapping = {
    firstNameCol: "First Name",
    lastNameCol: "Last Name",
    emailCol: "Email",
    phoneCol: "Phone",
    companyCol: "Company",
  };

  describe("validateImportRow", () => {
    it("accepts row with first name and email", () => {
      const row = { "First Name": "Alice", Email: "alice@example.com" };
      const res = validateImportRow(row, standardMapping);
      expect(res.valid).toBe(true);
    });

    it("accepts row with first name and phone (no email)", () => {
      const row = { "First Name": "Bob", Phone: "+1 555-0100" };
      const res = validateImportRow(row, standardMapping);
      expect(res.valid).toBe(true);
    });

    it("rejects row missing first name", () => {
      const row = { "First Name": "", Email: "no-name@example.com" };
      const res = validateImportRow(row, standardMapping);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Missing required field: First Name");
    });

    it("rejects row missing both email and phone", () => {
      const row = { "First Name": "Charlie", Company: "No Contact Ltd" };
      const res = validateImportRow(row, standardMapping);
      expect(res.valid).toBe(false);
      expect(res.error).toContain(
        "At least one contact method (email or phone) is required",
      );
    });

    it("rejects row with malformed email", () => {
      const row = { "First Name": "Dave", Email: "not-an-email" };
      const res = validateImportRow(row, standardMapping);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Invalid email address format");
    });
  });

  describe("executeCsvIngestion Duplicate Policies", () => {
    let mockSupabase: SupabaseClient;

    beforeEach(() => {
      mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "leads") {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    ilike: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        single: vi.fn().mockImplementation(() => {
                          // Default: no duplicate
                          return Promise.resolve({ data: null, error: null });
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "new-lead-id" },
                    error: null,
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }),
              }),
            };
          }
          if (table === "import_row_results") {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === "lead_activities") {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            };
          }
          if (table === "import_jobs") {
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }
          return {};
        }),
      } as unknown as SupabaseClient;
    });

    it("handles SKIP duplicate policy by discarding duplicates without error", async () => {
      // Mock existing duplicate for row 1
      const mockLeadSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            ilike: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "existing-lead-1" },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      mockSupabase.from = vi.fn((table: string) => {
        if (table === "leads") {
          return {
            select: mockLeadSelect,
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi
                  .fn()
                  .mockResolvedValue({ data: { id: "new-lead-2" } }),
              }),
            }),
          };
        }
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi
            .fn()
            .mockReturnValue({ eq: vi.fn().mockResolvedValue({}) }),
        };
      }) as unknown as typeof mockSupabase.from;

      const rows = [{ "First Name": "Alice", Email: "duplicate@example.com" }];

      const res = await executeCsvIngestion({
        supabase: mockSupabase,
        jobId: "job-1",
        workspaceId: "ws-1",
        userId: "user-1",
        rows,
        mapping: standardMapping,
        duplicatePolicy: "SKIP",
      });

      expect(res.skippedRows).toBe(1);
      expect(res.successfulRows).toBe(0);
      expect(res.failedRows).toBe(0);
    });

    it("handles UPDATE duplicate policy by enriching existing lead", async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      mockSupabase.from = vi.fn((table: string) => {
        if (table === "leads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  ilike: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: { id: "existing-lead-1" },
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi
            .fn()
            .mockReturnValue({ eq: vi.fn().mockResolvedValue({}) }),
        };
      }) as unknown as typeof mockSupabase.from;

      const rows = [
        {
          "First Name": "Alice",
          Email: "alice@example.com",
          Phone: "+1 555-4321",
          Company: "Alice New Co",
        },
      ];

      const res = await executeCsvIngestion({
        supabase: mockSupabase,
        jobId: "job-1",
        workspaceId: "ws-1",
        userId: "user-1",
        rows,
        mapping: standardMapping,
        duplicatePolicy: "UPDATE",
      });

      expect(res.successfulRows).toBe(1);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: "+1 555-4321",
          company_name: "Alice New Co",
        }),
      );
    });

    it("handles CONFLICT_REPORT duplicate policy by isolating row in errors", async () => {
      const mockInsertRowResult = vi.fn().mockResolvedValue({ error: null });

      mockSupabase.from = vi.fn((table: string) => {
        if (table === "leads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  ilike: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: { id: "existing-lead-1" },
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "import_row_results") {
          return { insert: mockInsertRowResult };
        }
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi
            .fn()
            .mockReturnValue({ eq: vi.fn().mockResolvedValue({}) }),
        };
      }) as unknown as typeof mockSupabase.from;

      const rows = [{ "First Name": "Alice", Email: "alice@example.com" }];

      const res = await executeCsvIngestion({
        supabase: mockSupabase,
        jobId: "job-1",
        workspaceId: "ws-1",
        userId: "user-1",
        rows,
        mapping: standardMapping,
        duplicatePolicy: "CONFLICT_REPORT",
      });

      expect(res.failedRows).toBe(1);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].error).toContain("Conflict");
      expect(mockInsertRowResult).toHaveBeenCalled();
    });

    it("isolates invalid rows while allowing valid rows in batch to succeed", async () => {
      const rows = [
        { "First Name": "", Email: "missing-name@example.com" }, // Invalid row
        { "First Name": "Valid User", Email: "valid@example.com" }, // Valid row
      ];

      const res = await executeCsvIngestion({
        supabase: mockSupabase,
        jobId: "job-1",
        workspaceId: "ws-1",
        userId: "user-1",
        rows,
        mapping: standardMapping,
        duplicatePolicy: "SKIP",
      });

      expect(res.failedRows).toBe(1);
      expect(res.successfulRows).toBe(1);
      expect(res.totalRows).toBe(2);
      expect(res.errors[0].rowNumber).toBe(2);
    });
  });

  describe("initiateCsvImportAction limits and security", () => {
    beforeEach(() => {
      vi.mocked(getActiveWorkspaceForUser).mockResolvedValue({
        user: { id: "user-1", email: "admin@agency.com" },
        workspace: {
          id: "ws-1",
          name: "Apex Agency",
          slug: "apex-agency",
          timezone: "UTC",
        },
        role: "ADMIN",
      });
    });

    it("rejects files exceeding the 10MB payload limit", async () => {
      // Create a 10.1MB string
      const largeContent = "a".repeat(10.1 * 1024 * 1024);

      const res = await initiateCsvImportAction({
        fileName: "massive.csv",
        csvContent: largeContent,
        mapping: standardMapping,
        duplicatePolicy: "SKIP",
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toContain("exceeds the 10MB limit");
      }
    });

    it("rejects batches exceeding 5,000 rows ceiling", async () => {
      // 5,005 rows
      const header = "First Name,Email\n";
      const rows = "John,john@example.com\n".repeat(5005);
      const content = header + rows;

      const res = await initiateCsvImportAction({
        fileName: "too-many-rows.csv",
        csvContent: content,
        mapping: standardMapping,
        duplicatePolicy: "SKIP",
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toContain("exceeds the 5,000 row maximum");
      }
    });
  });
});
