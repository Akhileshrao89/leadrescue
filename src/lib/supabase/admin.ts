import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/env";

/**
 * Creates an elevated administrative Supabase client using the SUPABASE_SERVICE_ROLE_KEY.
 * STRICTLY SERVER-ONLY: Never call or import this function in client components.
 * Used for webhook handlers (e.g. Stripe webhook updates) and system workers.
 */
export function createAdminSupabaseClient(): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const keyToUse = serviceRoleKey || anonKey;

  return createClient(url, keyToUse, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
