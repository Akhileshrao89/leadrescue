import { describe, it, expect } from "vitest";
import {
  parseCsv,
  sanitizeCsvCell,
  escapeCsvField,
  serializeCsv,
  MAX_CSV_FILE_SIZE,
  MAX_CSV_ROWS,
} from "@/features/imports/csv";

describe("Phase 6: RFC 4180 CSV Parser & Formula Injection Defense", () => {
  describe("Formula Injection Sanitization (DDE Attack Defense)", () => {
    it("neutralizes cells starting with = by prepending single quote", () => {
      expect(sanitizeCsvCell("=1+1")).toBe("'=1+1");
      expect(sanitizeCsvCell("=CMD|' /C calc'!A0")).toBe("'=CMD|' /C calc'!A0");
      expect(sanitizeCsvCell('=HYPERLINK("http://evil.com")')).toBe(
        '\'=HYPERLINK("http://evil.com")',
      );
    });

    it("neutralizes cells starting with +, -, @", () => {
      expect(sanitizeCsvCell("+12345")).toBe("'+12345");
      expect(sanitizeCsvCell("-55")).toBe("'-55");
      expect(sanitizeCsvCell("@SUM(A1:A10)")).toBe("'@SUM(A1:A10)");
    });

    it("neutralizes cells starting with tab or carriage return", () => {
      expect(sanitizeCsvCell("\t=calc")).toBe("'\t=calc");
    });

    it("leaves safe text unaltered", () => {
      expect(sanitizeCsvCell("Sarah Connor")).toBe("Sarah Connor");
      expect(sanitizeCsvCell("sarah@skynet.com")).toBe("sarah@skynet.com");
      expect(sanitizeCsvCell("+1 (555) 0199")).toBe("'+1 (555) 0199"); // sanitized due to leading +
      expect(sanitizeCsvCell("Acme Corp")).toBe("Acme Corp");
    });

    it("handles null and undefined safely", () => {
      expect(sanitizeCsvCell(null)).toBe("");
      expect(sanitizeCsvCell(undefined)).toBe("");
    });

    it("escapes fields containing commas or quotes using escapeCsvField", () => {
      expect(escapeCsvField("simple")).toBe("simple");
      expect(escapeCsvField("Hello, World")).toBe('"Hello, World"');
      expect(escapeCsvField('Quotes "here"')).toBe('"Quotes ""here"""');
    });
  });

  describe("RFC 4180 CSV Parser", () => {
    it("parses simple comma-separated rows", () => {
      const csv = "First Name,Email,Company\nJohn,john@example.com,Acme";
      const result = parseCsv(csv);

      expect(result.headers).toEqual(["First Name", "Email", "Company"]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]["First Name"]).toBe("John");
      expect(result.rows[0]["Email"]).toBe("john@example.com");
      expect(result.rows[0]["Company"]).toBe("Acme");
    });

    it("parses quoted cells containing commas", () => {
      const csv =
        'First Name,Company,Notes\nAlice,"Smith, Jones & Co.","Spoke Monday, agreed to audit"';
      const result = parseCsv(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]["Company"]).toBe("Smith, Jones & Co.");
      expect(result.rows[0]["Notes"]).toBe("Spoke Monday, agreed to audit");
    });

    it('parses quoted cells with escaped double quotes ("")', () => {
      const csv =
        'First Name,Notes\nBob,"He said ""Ready to proceed"" yesterday"';
      const result = parseCsv(csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]["Notes"]).toBe(
        'He said "Ready to proceed" yesterday',
      );
    });

    it("handles CRLF (\\r\\n) and LF (\\n) line breaks", () => {
      const csvCRLF = "Name,Phone\r\nDave,555-1234\r\nEva,555-5678\r\n";
      const result = parseCsv(csvCRLF);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]["Name"]).toBe("Dave");
      expect(result.rows[1]["Name"]).toBe("Eva");
    });

    it("returns empty result on empty or whitespace string", () => {
      expect(parseCsv("").rows).toHaveLength(0);
      expect(parseCsv("   \n\n  ").rows).toHaveLength(0);
    });
  });

  describe("CSV Serialization with Sanitization", () => {
    it("serializes records and prevents formula injection in output", () => {
      const columns = [
        { key: "name", label: "Name" },
        { key: "formula", label: "Formula Test" },
      ];
      const data = [
        { name: "Safe User", formula: "=1+1" },
        { name: "Another User", formula: "@SUM(B1:B5)" },
      ];

      const csv = serializeCsv(columns, data);
      expect(csv).toContain("Name,Formula Test");
      expect(csv).toContain("Safe User,'=1+1");
      expect(csv).toContain("Another User,'@SUM(B1:B5)");
    });

    it("escapes fields with commas and quotes properly", () => {
      const columns = [{ key: "val", label: "Value" }];
      const data = [{ val: 'Contains "quotes" and, comma' }];

      const csv = serializeCsv(columns, data);
      expect(csv).toContain('"Contains ""quotes"" and, comma"');
    });
  });

  describe("Constants & Limits", () => {
    it("defines 10MB size limit and 5,000 row ceiling", () => {
      expect(MAX_CSV_FILE_SIZE).toBe(10 * 1024 * 1024);
      expect(MAX_CSV_ROWS).toBe(5000);
    });
  });
});
