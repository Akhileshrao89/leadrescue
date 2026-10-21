/**
 * Sanitizes return URLs to prevent open redirect vulnerabilities.
 * Strictly enforces single leading slash and rejects protocol-relative,
 * backslash, and absolute scheme URLs.
 */
export function sanitizeReturnUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== "string") return "/dashboard";
  const trimmed = rawUrl.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.startsWith("/\\") &&
    !trimmed.includes(":") &&
    !trimmed.includes("\\")
  ) {
    return trimmed;
  }
  return "/dashboard";
}
