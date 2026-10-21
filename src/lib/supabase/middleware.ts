import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/env";
import { applySecurityHeaders } from "@/lib/security/headers";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limiter";
import { logger } from "@/lib/security/logger";

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request);

  // 1. IP-based rate limiting on sensitive public authentication routes
  if (pathname === "/login" || pathname === "/signup") {
    // 10 attempts per minute per IP
    const rateCheck = checkRateLimit(`ip_auth:${ip}`, 10, 60);
    if (!rateCheck.allowed) {
      logger.warn("Auth route IP rate limit triggered", { ip, pathname });

      const response = NextResponse.json(
        {
          error: "Too many requests. Please try again later.",
          retryAfter: rateCheck.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateCheck.retryAfterSeconds || 60),
          },
        },
      );
      applySecurityHeaders(response.headers);
      return response;
    }
  }

  const { url, anonKey, isConfigured } = getSupabaseConfig();

  if (!isConfigured) {
    const response = NextResponse.next({ request });
    applySecurityHeaders(response.headers);
    return response;
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect /dashboard routes
  if (pathname.startsWith("/dashboard") && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("returnUrl", pathname);
    const response = NextResponse.redirect(redirectUrl);
    applySecurityHeaders(response.headers);
    return response;
  }

  // Redirect authenticated users away from public auth pages
  if ((pathname === "/login" || pathname === "/signup") && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    const response = NextResponse.redirect(redirectUrl);
    applySecurityHeaders(response.headers);
    return response;
  }

  applySecurityHeaders(supabaseResponse.headers);
  return supabaseResponse;
}
