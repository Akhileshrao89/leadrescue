import { SupabaseClient } from "@supabase/supabase-js";
import { PLANS, SubscriptionTier } from "./plans";

export interface StripeEventPayload {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

// In-memory set to guarantee idempotent processing in running instances
const processedEventIds = new Set<string>();

export function isEventAlreadyProcessed(eventId: string): boolean {
  return processedEventIds.has(eventId);
}

export function markEventAsProcessed(eventId: string): void {
  processedEventIds.add(eventId);
  // Cap memory size
  if (processedEventIds.size > 2000) {
    const firstItem = processedEventIds.values().next().value;
    if (firstItem) processedEventIds.delete(firstItem);
  }
}

export function resetProcessedEventIds(): void {
  processedEventIds.clear();
}

/**
 * Processes verified Stripe webhook events idempotently.
 */
export async function handleStripeWebhookEvent(
  supabase: SupabaseClient,
  event: StripeEventPayload,
): Promise<{ success: boolean; handled: boolean; error?: string }> {
  if (isEventAlreadyProcessed(event.id)) {
    return { success: true, handled: true };
  }

  const obj = event.data?.object || {};

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const metadata = (obj.metadata as Record<string, string>) || {};
        const workspaceId =
          (obj.client_reference_id as string) || metadata.workspace_id;

        if (!workspaceId) {
          return {
            success: false,
            handled: false,
            error: "Missing workspace_id in checkout.session.completed payload",
          };
        }

        const requestedTier = (metadata.tier as SubscriptionTier) || "STARTER";
        const plan = PLANS[requestedTier] || PLANS.STARTER;

        const customerId = (obj.customer as string) || null;
        const subscriptionId = (obj.subscription as string) || null;

        await supabase.from("subscriptions").upsert(
          {
            workspace_id: workspaceId,
            tier: plan.tier,
            status: "ACTIVE",
            max_active_leads: plan.maxActiveLeads,
            max_members: plan.maxMembers,
            monthly_ai_drafts_quota: plan.monthlyAiDraftsQuota,
            external_customer_id: customerId,
            external_subscription_id: subscriptionId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id" },
        );

        markEventAsProcessed(event.id);
        return { success: true, handled: true };
      }

      case "customer.subscription.updated": {
        const subId = obj.id as string;
        const status = (obj.status as string)?.toUpperCase();
        const periodStart = obj.current_period_start
          ? new Date((obj.current_period_start as number) * 1000).toISOString()
          : null;
        const periodEnd = obj.current_period_end
          ? new Date((obj.current_period_end as number) * 1000).toISOString()
          : null;

        // Resolve plan tier from items price if possible
        const items = (
          obj.items as { data?: Array<{ price?: { id?: string } }> }
        )?.data;
        const priceId = items?.[0]?.price?.id;
        let tier: SubscriptionTier = "STARTER";
        if (priceId && priceId === PLANS.AGENCY.stripePriceId) {
          tier = "AGENCY";
        }
        const plan = PLANS[tier];

        const updatePayload: Record<string, unknown> = {
          tier: plan.tier,
          max_active_leads: plan.maxActiveLeads,
          max_members: plan.maxMembers,
          monthly_ai_drafts_quota: plan.monthlyAiDraftsQuota,
          updated_at: new Date().toISOString(),
        };

        if (status) {
          updatePayload.status =
            status === "ACTIVE"
              ? "ACTIVE"
              : status === "PAST_DUE"
                ? "PAST_DUE"
                : status === "TRIALING"
                  ? "TRIALING"
                  : status === "CANCELED"
                    ? "CANCELLED"
                    : "ACTIVE";
        }

        if (periodStart) updatePayload.current_period_start = periodStart;
        if (periodEnd) updatePayload.current_period_end = periodEnd;

        await supabase
          .from("subscriptions")
          .update(updatePayload)
          .eq("external_subscription_id", subId);

        markEventAsProcessed(event.id);
        return { success: true, handled: true };
      }

      case "customer.subscription.deleted": {
        const subId = obj.id as string;
        // Downgrade to FREE plan gracefully without deleting user data
        const freePlan = PLANS.FREE;

        await supabase
          .from("subscriptions")
          .update({
            tier: freePlan.tier,
            status: "CANCELLED",
            max_active_leads: freePlan.maxActiveLeads,
            max_members: freePlan.maxMembers,
            monthly_ai_drafts_quota: freePlan.monthlyAiDraftsQuota,
            updated_at: new Date().toISOString(),
          })
          .eq("external_subscription_id", subId);

        markEventAsProcessed(event.id);
        return { success: true, handled: true };
      }

      case "invoice.payment_succeeded": {
        const subId = (obj.subscription as string) || null;
        if (subId) {
          // Reset monthly AI draft usage on successful monthly invoice
          await supabase
            .from("subscriptions")
            .update({
              status: "ACTIVE",
              ai_drafts_used: 0,
              updated_at: new Date().toISOString(),
            })
            .eq("external_subscription_id", subId);
        }

        markEventAsProcessed(event.id);
        return { success: true, handled: true };
      }

      case "invoice.payment_failed": {
        const subId = (obj.subscription as string) || null;
        if (subId) {
          await supabase
            .from("subscriptions")
            .update({
              status: "PAST_DUE",
              updated_at: new Date().toISOString(),
            })
            .eq("external_subscription_id", subId);
        }

        markEventAsProcessed(event.id);
        return { success: true, handled: true };
      }

      default:
        // Acknowledge unhandled events gracefully
        return { success: true, handled: false };
    }
  } catch (err) {
    return {
      success: false,
      handled: false,
      error: err instanceof Error ? err.message : "Webhook handler exception",
    };
  }
}
