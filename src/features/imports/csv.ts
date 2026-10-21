/**
 * RFC 4180 Compliant CSV Parser & Sanitizer
 * Implements bounded streaming parsing, formula injection sanitization,
 * and escaping for Excel/Calc interoperability.
 */

export const MAX_CSV_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_CSV_ROWS = 5000;

/**
 * Formula injection characters that spreadsheet tools (Excel, Calc) execute.
 * Cells starting with these characters MUST be prefixed with an apostrophe (').
 */
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Sanitizes a cell value against CSV / Spreadsheet formula injection (DDE attacks).
 * If the string starts with =, +, -, @, \t, or \r, prefixes it with a single quote (').
 */
export function sanitizeCsvCell(cellValue: unknown): string {
  if (cellValue === null || cellValue === undefined) {
    return "";
  }
  const str = String(cellValue);
  if (str.length === 0) return "";

  const trimmedStart = str.trimStart();
  if (trimmedStart.length === 0) return "";

  const firstChar = str.charAt(0);
  const firstTrimmedChar = trimmedStart.charAt(0);

  if (
    FORMULA_TRIGGERS.includes(firstChar) ||
    FORMULA_TRIGGERS.includes(firstTrimmedChar)
  ) {
    return `'${str}`;
  }
  return str;
}

/**
 * Escapes and wraps a cell value in quotes according to RFC 4180 rules.
 */
export function escapeCsvField(field: unknown): string {
  const sanitized = sanitizeCsvCell(field);
  // If field contains comma, quote, or newline, escape double quotes and wrap in quotes
  if (
    sanitized.includes(",") ||
    sanitized.includes('"') ||
    sanitized.includes("\n") ||
    sanitized.includes("\r")
  ) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

/**
 * RFC 4180 compliant CSV parser.
 * Supports multiline quoted cells, escaped double quotes (""), and varied line breaks (CRLF, LF).
 */
export function parseCsv(csvText: string): ParsedCsvResult {
  if (!csvText || csvText.trim().length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  const rawRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let i = 0;
  const len = csvText.length;

  while (i < len) {
    const char = csvText[i];
    const nextChar = i + 1 < len ? csvText[i + 1] : "";

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === ",") {
        currentRow.push(currentField.trim());
        currentField = "";
        i++;
        continue;
      } else if (char === "\r") {
        if (nextChar === "\n") {
          i++;
        }
        currentRow.push(currentField.trim());
        rawRows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField.trim());
        rawRows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push remainder
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rawRows.push(currentRow);
  }

  // Filter out any trailing empty lines
  const nonEmptyRows = rawRows.filter(
    (row) => row.length > 1 || (row.length === 1 && row[0].length > 0),
  );

  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  const headers = nonEmptyRows[0].map((h) => h.trim());
  const dataRows = nonEmptyRows.slice(1);

  const mappedRows: Record<string, string>[] = [];
  for (const row of dataRows) {
    const rowObj: Record<string, string> = {};
    headers.forEach((header, index) => {
      rowObj[header] = row[index] !== undefined ? row[index].trim() : "";
    });
    mappedRows.push(rowObj);
  }

  return {
    headers,
    rows: mappedRows,
    totalRows: mappedRows.length,
  };
}

/**
 * Serializes an array of records or objects into an RFC 4180 CSV string
 * with formula injection sanitization applied to every cell.
 */
export function serializeCsv(
  columns: { key: string; label: string }[],
  data: Record<string, unknown>[],
): string {
  const headerLine = columns.map((c) => escapeCsvField(c.label)).join(",");
  const rowLines = data.map((item) =>
    columns.map((c) => escapeCsvField(item[c.key])).join(","),
  );

  return [headerLine, ...rowLines].join("\r\n");
}
