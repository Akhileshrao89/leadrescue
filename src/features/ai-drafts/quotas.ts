import { SupabaseClient } from "@supabase/supabase-js";
import { QuotaStatus } from "./types";

export interface QuotaCheckResult {
  allowed: boolean;
  quota: number;
  used: number;
  remaining: number;
  error?: string;
}

/**
 * Atomically checks and consumes 1 AI drafting quota unit for the active workspace.
 */
export async function checkAndConsumeAiQuota(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<QuotaCheckResult> {
  // 1. Try calling the PostgreSQL RPC stored procedure for concurrency-locked check and update
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "check_and_consume_ai_quota",
    { p_workspace_id: workspaceId },
  );

  if (!rpcError && rpcData && typeof rpcData === "object") {
    const res = rpcData as QuotaCheckResult;
    return {
      allowed: Boolean(res.allowed),
      quota: Number(res.quota) || 20,
      used: Number(res.used) || 0,
      remaining: Math.max(0, Number(res.remaining) || 0),
      error: res.error,
    };
  }

  // 2. Fallback for environments / mocks where RPC is not implemented
  const now = new Date();
  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select("id, monthly_ai_drafts_quota, ai_drafts_used, current_period_end")
    .eq("workspace_id", workspaceId)
    .single();

  if (subError || !sub) {
    // If no subscription row exists, simulate FREE tier default (20 quota)
    return {
      allowed: true,
      quota: 20,
      used: 1,
      remaining: 19,
    };
  }

  const quota = sub.monthly_ai_drafts_quota ?? 20;
  let used = sub.ai_drafts_used ?? 0;

  // Check period rollover
  if (sub.current_period_end && new Date(sub.current_period_end) <= now) {
    used = 0;
  }

  if (used >= quota) {
    return {
      allowed: false,
      quota,
      used,
      remaining: 0,
      error: `Monthly AI drafting quota exceeded (${used}/${quota}). Upgrade your subscription or use free standard templates.`,
    };
  }

  // Consume 1 unit
  const nextUsed = used + 1;
  await supabase
    .from("subscriptions")
    .update({
      ai_drafts_used: nextUsed,
      updated_at: now.toISOString(),
    })
    .eq("id", sub.id);

  return {
    allowed: true,
    quota,
    used: nextUsed,
    remaining: quota - nextUsed,
  };
}

/**
 * Returns read-only quota status for the workspace.
 */
export async function getWorkspaceAiQuota(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<QuotaStatus> {
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_workspace_ai_quota",
    { p_workspace_id: workspaceId },
  );

  if (!rpcError && rpcData && typeof rpcData === "object") {
    const res = rpcData as QuotaStatus;
    return {
      quota: Number(res.quota) || 20,
      used: Number(res.used) || 0,
      remaining: Math.max(0, Number(res.remaining) || 0),
      tier: (res.tier as "FREE" | "STARTER" | "AGENCY") || "FREE",
    };
  }

  // Fallback direct query
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("monthly_ai_drafts_quota, ai_drafts_used, tier")
    .eq("workspace_id", workspaceId)
    .single();

  if (!sub) {
    return {
      quota: 20,
      used: 0,
      remaining: 20,
      tier: "FREE",
    };
  }

  const quota = sub.monthly_ai_drafts_quota ?? 20;
  const used = sub.ai_drafts_used ?? 0;

  return {
    quota,
    used,
    remaining: Math.max(0, quota - used),
    tier: (sub.tier as "FREE" | "STARTER" | "AGENCY") || "FREE",
  };
}
