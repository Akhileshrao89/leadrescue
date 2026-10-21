"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifyWorkspaceMembership } from "@/features/workspaces/rbac";
import { SubscriptionTier, SubscriptionStatus, getPlanByTier } from "./plans";
import {
  createStripeCheckoutSession,
  createStripeBillingPortalSession,
} from "./stripe";

export interface WorkspaceSubscriptionDetails {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  maxActiveLeads: number;
  maxMembers: number;
  aiDraftsUsed: number;
  monthlyAiDraftsQuota: number;
  activeLeadsCount: number;
  currentPeriodEnd: string | null;
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
}

export type FetchSubscriptionResult =
  | { success: true; subscription: WorkspaceSubscriptionDetails }
  | { success: false; error: string };

export type CheckoutSessionResult =
  | { success: true; url: string; sessionId?: string }
  | { success: false; error: string };

export type BillingPortalResult =
  { success: true; url: string } | { success: false; error: string };

/**
 * Fetches real-time subscription details, lead count, and AI draft usage for the active workspace.
 */
export async function fetchSubscriptionAction(): Promise<FetchSubscriptionResult> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "billing:view",
  });

  if (!authResult.authorized) {
    return { success: false, error: authResult.error };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { success: false, error: "Database not configured." };
  }

  const { workspace } = authResult.context;

  // 1. Fetch subscription record
  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("workspace_id", workspace.id)
    .single();

  if (subError && subError.code !== "PGRST116") {
    // Non-404 error
    return { success: false, error: subError.message };
  }

  const tier = (sub?.tier as SubscriptionTier) || "FREE";
  const plan = getPlanByTier(tier);

  // 2. Count active leads
  const { count: activeLeadsCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id)
    .eq("is_archived", false);

  const subscription: WorkspaceSubscriptionDetails = {
    tier,
    status: (sub?.status as SubscriptionStatus) || "ACTIVE",
    maxActiveLeads: sub?.max_active_leads ?? plan.maxActiveLeads,
    maxMembers: sub?.max_members ?? plan.maxMembers,
    aiDraftsUsed: sub?.ai_drafts_used ?? 0,
    monthlyAiDraftsQuota:
      sub?.monthly_ai_drafts_quota ?? plan.monthlyAiDraftsQuota,
    activeLeadsCount: activeLeadsCount ?? 0,
    currentPeriodEnd: sub?.current_period_end ?? null,
    externalCustomerId: sub?.external_customer_id ?? null,
    externalSubscriptionId: sub?.external_subscription_id ?? null,
  };

  return { success: true, subscription };
}

/**
 * Generates a Stripe Checkout Session for upgrading plan tier.
 * Restricted to workspace OWNER or ADMIN.
 */
export async function createCheckoutSessionAction(
  tier: SubscriptionTier,
): Promise<CheckoutSessionResult> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "billing:manage",
  });

  if (!authResult.authorized) {
    return { success: false, error: authResult.error };
  }

  const { workspace, user } = authResult.context;

  if (tier === "FREE") {
    return {
      success: false,
      error:
        "Cannot create a checkout session for Free tier. Downgrades are handled via the customer billing portal.",
    };
  }

  const result = await createStripeCheckoutSession({
    workspaceId: workspace.id,
    customerEmail: user.email ?? undefined,
    tier,
  });

  if (!result.success || !result.url) {
    return {
      success: false,
      error: result.error || "Failed to initialize Stripe Checkout session.",
    };
  }

  return {
    success: true,
    url: result.url,
    sessionId: result.sessionId,
  };
}

/**
 * Generates a Stripe Customer Portal link for managing cards, billing, and cancellations.
 * Restricted to workspace OWNER or ADMIN.
 */
export async function createBillingPortalAction(): Promise<BillingPortalResult> {
  const authResult = await verifyWorkspaceMembership({
    requiredAction: "billing:manage",
  });

  if (!authResult.authorized) {
    return { success: false, error: authResult.error };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { success: false, error: "Database not configured." };
  }

  const { workspace } = authResult.context;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("external_customer_id")
    .eq("workspace_id", workspace.id)
    .single();

  const customerId =
    sub?.external_customer_id || `cus_mock_${workspace.id.slice(0, 8)}`;

  const result = await createStripeBillingPortalSession({
    customerId,
  });

  if (!result.success || !result.url) {
    return {
      success: false,
      error: result.error || "Failed to open Stripe Billing Portal.",
    };
  }

  return {
    success: true,
    url: result.url,
  };
}
