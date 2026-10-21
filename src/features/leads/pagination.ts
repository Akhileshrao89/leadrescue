export interface KeysetCursorPayload {
  sortValue: string | null;
  id: string;
  direction?: "asc" | "desc";
}

export interface KeysetPageResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
}

/**
 * Encodes sort criteria and lead ID into an opaque, URL-safe base64 cursor.
 */
export function encodeCursor(payload: KeysetCursorPayload): string {
  const jsonStr = JSON.stringify({
    s: payload.sortValue,
    i: payload.id,
    d: payload.direction || "asc",
  });
  return Buffer.from(jsonStr, "utf8").toString("base64url");
}

/**
 * Decodes an opaque base64 cursor into structured query seek coordinates.
 * Returns null if the cursor is malformed or invalid.
 */
export function decodeCursor(
  cursor: string | null | undefined,
): KeysetCursorPayload | null {
  if (!cursor || typeof cursor !== "string") return null;

  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed.i !== "string") {
      return null;
    }

    return {
      sortValue: parsed.s !== undefined ? parsed.s : null,
      id: parsed.i,
      direction: parsed.d === "desc" ? "desc" : "asc",
    };
  } catch {
    return null;
  }
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/**
 * Sanitizes and bounds requested page size between 1 and MAX_PAGE_SIZE.
 */
export function clampPageSize(requested?: number | null): number {
  if (!requested || isNaN(requested)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(1, Math.floor(requested)), MAX_PAGE_SIZE);
}
