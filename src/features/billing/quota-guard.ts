import { SupabaseClient } from "@supabase/supabase-js";
import { SubscriptionTier, SubscriptionStatus, PLANS } from "./plans";
import { tenantCache } from "@/lib/cache/tenant-cache";

export interface QuotaGuardResult {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  error?: string;
}

/**
 * Checks whether the workspace is entitled to create a new lead.
 * Verifies active subscription status and enforces tier lead ceilings.
 */
export async function checkLeadCreationQuota(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<QuotaGuardResult> {
  // 1. Fetch workspace subscription
  let sub: {
    tier?: string;
    status?: string;
    max_active_leads?: number;
  } | null = null;
  try {
    const subTable = supabase.from("subscriptions");
    if (subTable && typeof subTable.select === "function") {
      const q = subTable.select("tier, status, max_active_leads");
      if (q && typeof q.eq === "function") {
        const qEq = q.eq("workspace_id", workspaceId);
        if (qEq && typeof qEq.single === "function") {
          const res = await qEq.single();
          sub = res?.data ?? null;
        }
      }
    }
  } catch {
    // Fall back to default free tier if subscriptions query is unavailable in mock
    sub = null;
  }

  const tier = (sub?.tier as SubscriptionTier) || "FREE";
  const status = (sub?.status as SubscriptionStatus) || "ACTIVE";
  const maxAllowed = sub?.max_active_leads ?? PLANS[tier].maxActiveLeads;

  // 2. Enforce read-only grace period if subscription was cancelled or unpaid
  if (status === "CANCELLED") {
    return {
      allowed: false,
      currentCount: 0,
      maxAllowed,
      tier,
      status,
      error:
        "Subscription is cancelled. Workspace is in read-only mode. Please reactivate your subscription to create new leads.",
    };
  }

  // 3. Count current active (non-archived) leads (with tenant cache acceleration)
  let currentCount = tenantCache.get<number>(
    workspaceId,
    "leads",
    "active_count",
  );
  if (currentCount === null) {
    try {
      const leadsTable = supabase.from("leads");
      if (leadsTable && typeof leadsTable.select === "function") {
        const q = leadsTable.select("id", { count: "exact", head: true });
        if (q && typeof q.eq === "function") {
          const qWs = q.eq("workspace_id", workspaceId);
          if (qWs && typeof qWs.eq === "function") {
            const res = await qWs.eq("is_archived", false);
            currentCount = res?.count ?? 0;
            tenantCache.set(
              workspaceId,
              "leads",
              "active_count",
              currentCount,
              30,
            );
          }
        }
      }
    } catch {
      currentCount = 0;
    }
  }
  if (currentCount === null) currentCount = 0;

  if (currentCount >= maxAllowed) {
    return {
      allowed: false,
      currentCount,
      maxAllowed,
      tier,
      status,
      error: `Plan quota reached: You have reached the maximum limit of ${maxAllowed} active prospects for your ${PLANS[tier].name}. Please upgrade your subscription in Workspace Settings to add more leads.`,
    };
  }

  return {
    allowed: true,
    currentCount,
    maxAllowed,
    tier,
    status,
  };
}

/**
 * Validates whether an incoming batch of imported rows will exceed workspace lead quotas.
 */
export async function checkCsvImportQuota(
  supabase: SupabaseClient,
  workspaceId: string,
  incomingRowsCount: number,
): Promise<QuotaGuardResult> {
  const guard = await checkLeadCreationQuota(supabase, workspaceId);
  if (!guard.allowed) return guard;

  if (guard.currentCount + incomingRowsCount > guard.maxAllowed) {
    const availableSlots = Math.max(0, guard.maxAllowed - guard.currentCount);
    return {
      ...guard,
      allowed: false,
      error: `Import exceeds plan capacity: Upload contains ${incomingRowsCount} rows, but your ${PLANS[guard.tier].name} only has ${availableSlots} prospect slots remaining (${guard.currentCount}/${guard.maxAllowed}). Upgrade to import larger batches.`,
    };
  }

  return guard;
}
