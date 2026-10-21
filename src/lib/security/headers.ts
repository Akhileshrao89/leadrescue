export const SECURITY_HEADERS: Record<string, string> = {
  // Content Security Policy: Restricts scripts, styles, frames, and connections
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.resend.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; "),

  // Strict Transport Security (HSTS): Force HTTPS for 2 years with preloading
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",

  // Prevent clickjacking by forbidding embedding in iframes
  "X-Frame-Options": "DENY",

  // Prevent MIME-type sniffing
  "X-Content-Type-Options": "nosniff",

  // Send full URL on same-origin, but only origin when navigating across origins
  "Referrer-Policy": "strict-origin-when-cross-origin",

  // Restrict access to sensitive browser features/hardware
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), browsing-topics=()",

  // DNS prefetch control
  "X-DNS-Prefetch-Control": "on",
};

/**
 * Applies security headers to a Response object.
 */
export function applySecurityHeaders(headers: Headers): Headers {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  return headers;
}
