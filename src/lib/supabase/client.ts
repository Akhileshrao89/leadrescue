import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/env";

/**
 * Browser-side Supabase client using NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Only public keys permitted in this module.
 */
export function createClient() {
  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) {
    // Provide safe fallback browser client to avoid crashing client components in demo mode
    return createBrowserClient(
      url || "https://mock-demo.supabase.co",
      anonKey || "mock-demo-anon-key",
    );
  }
  return createBrowserClient(url, anonKey);
}
