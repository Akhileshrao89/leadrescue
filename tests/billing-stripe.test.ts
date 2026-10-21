import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  verifyStripeWebhookSignature,
  createStripeCheckoutSession,
  createStripeBillingPortalSession,
} from "@/features/billing/stripe";
import {
  handleStripeWebhookEvent,
  resetProcessedEventIds,
  isEventAlreadyProcessed,
  type StripeEventPayload,
} from "@/features/billing/webhook-handler";
import {
  PLANS,
  getPlanByTier,
  getTierByPriceId,
} from "@/features/billing/plans";
import { SupabaseClient } from "@supabase/supabase-js";

interface CapturedUpdate {
  table: string;
  data: Record<string, unknown>;
  method: string;
}

describe("Phase 9: Billing Plans & Stripe Integration", () => {
  const webhookSecret = "whsec_test_secret_1234567890abcdef";

  function createSignedHeader(
    payload: string,
    secret: string,
    timestamp?: number,
  ): string {
    const t = timestamp ?? Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${t}.${payload}`)
      .digest("hex");
    return `t=${t},v1=${signature}`;
  }

  describe("Plan Tier Definitions", () => {
    it("defines Free, Starter, and Agency tiers correctly", () => {
      expect(PLANS.FREE.maxActiveLeads).toBe(100);
      expect(PLANS.FREE.maxMembers).toBe(2);
      expect(PLANS.FREE.monthlyAiDraftsQuota).toBe(20);

      expect(PLANS.STARTER.maxActiveLeads).toBe(500);
      expect(PLANS.STARTER.maxMembers).toBe(5);
      expect(PLANS.STARTER.monthlyAiDraftsQuota).toBe(100);

      expect(PLANS.AGENCY.maxActiveLeads).toBe(2500);
      expect(PLANS.AGENCY.maxMembers).toBe(15);
      expect(PLANS.AGENCY.monthlyAiDraftsQuota).toBe(500);
    });

    it("resolves plans by tier name gracefully", () => {
      expect(getPlanByTier("STARTER").tier).toBe("STARTER");
      expect(getPlanByTier("starter").tier).toBe("STARTER");
      expect(getPlanByTier("AGENCY").tier).toBe("AGENCY");
      expect(getPlanByTier("UNKNOWN").tier).toBe("FREE");
      expect(getPlanByTier(null).tier).toBe("FREE");
    });

    it("resolves tiers by Stripe price ID", () => {
      expect(getTierByPriceId(PLANS.STARTER.stripePriceId)).toBe("STARTER");
      expect(getTierByPriceId(PLANS.AGENCY.stripePriceId)).toBe("AGENCY");
      expect(getTierByPriceId("unknown_price")).toBe("FREE");
    });
  });

  describe("Stripe Webhook Signature Verification (HMAC-SHA256)", () => {
    it("successfully verifies valid webhook signatures", () => {
      const payload = JSON.stringify({
        id: "evt_123",
        type: "checkout.session.completed",
      });
      const header = createSignedHeader(payload, webhookSecret);

      const result = verifyStripeWebhookSignature({
        rawBody: payload,
        signatureHeader: header,
        webhookSecret,
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("fails verification when payload has been tampered", () => {
      const payload = JSON.stringify({
        id: "evt_123",
        type: "checkout.session.completed",
      });
      const header = createSignedHeader(payload, webhookSecret);

      const tamperedPayload = JSON.stringify({
        id: "evt_123",
        type: "customer.subscription.deleted",
      });
      const result = verifyStripeWebhookSignature({
        rawBody: tamperedPayload,
        signatureHeader: header,
        webhookSecret,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("HMAC mismatch");
    });

    it("fails verification when timestamp is expired (replay attack guard)", () => {
      const payload = JSON.stringify({ id: "evt_123" });
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago (> 300s tolerance)
      const header = createSignedHeader(payload, webhookSecret, oldTimestamp);

      const result = verifyStripeWebhookSignature({
        rawBody: payload,
        signatureHeader: header,
        webhookSecret,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain("tolerance");
    });

    it("fails when signature header is missing or malformed", () => {
      const payload = JSON.stringify({ id: "evt_123" });

      const missingResult = verifyStripeWebhookSignature({
        rawBody: payload,
        signatureHeader: null,
        webhookSecret,
      });
      expect(missingResult.valid).toBe(false);
      expect(missingResult.error).toContain("Missing");

      const malformedResult = verifyStripeWebhookSignature({
        rawBody: payload,
        signatureHeader: "invalid_format",
        webhookSecret,
      });
      expect(malformedResult.valid).toBe(false);
      expect(malformedResult.error).toContain("Malformed");
    });
  });

  describe("Checkout & Portal Sessions", () => {
    it("creates a checkout session URL with workspace metadata", async () => {
      const res = await createStripeCheckoutSession({
        workspaceId: "ws-1234-uuid",
        customerEmail: "owner@agency.com",
        tier: "STARTER",
      });

      expect(res.success).toBe(true);
      expect(res.url).toBeDefined();
      expect(res.url).toContain("ws-1234-uuid");
      expect(res.url).toContain("STARTER");
    });

    it("creates a customer billing portal session URL", async () => {
      const res = await createStripeBillingPortalSession({
        customerId: "cus_mock_client",
      });

      expect(res.success).toBe(true);
      expect(res.url).toBeDefined();
      expect(res.url).toContain("simulated_portal=true");
    });
  });

  describe("Idempotent Webhook Event Processor", () => {
    beforeEach(() => {
      resetProcessedEventIds();
    });

    function createMockSupabase(
      capturedUpdates: CapturedUpdate[],
    ): SupabaseClient {
      return {
        from: (table: string) => ({
          upsert: async (data: Record<string, unknown>) => {
            capturedUpdates.push({ table, data, method: "upsert" });
            return { error: null };
          },
          update: (data: Record<string, unknown>) => ({
            eq: async (col: string, val: unknown) => {
              capturedUpdates.push({
                table,
                data: { ...data, [col]: val },
                method: "update",
              });
              return { error: null };
            },
          }),
        }),
      } as unknown as SupabaseClient;
    }

    it("processes checkout.session.completed and upserts subscription with starter tier", async () => {
      const updates: CapturedUpdate[] = [];
      const supabase = createMockSupabase(updates);

      const event: StripeEventPayload = {
        id: "evt_test_checkout_1",
        type: "checkout.session.completed",
        data: {
          object: {
            client_reference_id: "ws-test-1",
            customer: "cus_123",
            subscription: "sub_123",
            metadata: {
              workspace_id: "ws-test-1",
              tier: "STARTER",
            },
          },
        },
      };

      const result = await handleStripeWebhookEvent(supabase, event);
      expect(result.success).toBe(true);
      expect(result.handled).toBe(true);
      expect(isEventAlreadyProcessed("evt_test_checkout_1")).toBe(true);

      expect(updates.length).toBe(1);
      expect(updates[0].table).toBe("subscriptions");
      expect(updates[0].data.workspace_id).toBe("ws-test-1");
      expect(updates[0].data.tier).toBe("STARTER");
      expect(updates[0].data.max_active_leads).toBe(500);
      expect(updates[0].data.monthly_ai_drafts_quota).toBe(100);
      expect(updates[0].data.status).toBe("ACTIVE");
    });

    it("guarantees idempotency on duplicate event receipt", async () => {
      const updates: CapturedUpdate[] = [];
      const supabase = createMockSupabase(updates);

      const event: StripeEventPayload = {
        id: "evt_duplicate_id",
        type: "checkout.session.completed",
        data: {
          object: {
            client_reference_id: "ws-test-1",
            metadata: { workspace_id: "ws-test-1", tier: "AGENCY" },
          },
        },
      };

      const firstRun = await handleStripeWebhookEvent(supabase, event);
      expect(firstRun.success).toBe(true);
      expect(updates.length).toBe(1);

      // Replay same event ID
      const secondRun = await handleStripeWebhookEvent(supabase, event);
      expect(secondRun.success).toBe(true);
      expect(secondRun.handled).toBe(true);
      // No additional database write should occur
      expect(updates.length).toBe(1);
    });

    it("handles customer.subscription.deleted by gracefully downgrading to FREE without deleting leads", async () => {
      const updates: CapturedUpdate[] = [];
      const supabase = createMockSupabase(updates);

      const event: StripeEventPayload = {
        id: "evt_cancel_1",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_cancelled_123",
          },
        },
      };

      const result = await handleStripeWebhookEvent(supabase, event);
      expect(result.success).toBe(true);
      expect(updates.length).toBe(1);
      expect(updates[0].data.tier).toBe("FREE");
      expect(updates[0].data.status).toBe("CANCELLED");
      expect(updates[0].data.max_active_leads).toBe(100);
      expect(updates[0].data.external_subscription_id).toBe(
        "sub_cancelled_123",
      );
    });

    it("handles invoice.payment_succeeded by resetting monthly AI draft quota", async () => {
      const updates: CapturedUpdate[] = [];
      const supabase = createMockSupabase(updates);

      const event: StripeEventPayload = {
        id: "evt_invoice_paid",
        type: "invoice.payment_succeeded",
        data: {
          object: {
            subscription: "sub_active_456",
          },
        },
      };

      const result = await handleStripeWebhookEvent(supabase, event);
      expect(result.success).toBe(true);
      expect(updates.length).toBe(1);
      expect(updates[0].data.ai_drafts_used).toBe(0);
      expect(updates[0].data.status).toBe("ACTIVE");
    });

    it("handles invoice.payment_failed by marking status PAST_DUE", async () => {
      const updates: CapturedUpdate[] = [];
      const supabase = createMockSupabase(updates);

      const event: StripeEventPayload = {
        id: "evt_invoice_failed",
        type: "invoice.payment_failed",
        data: {
          object: {
            subscription: "sub_failing_789",
          },
        },
      };

      const result = await handleStripeWebhookEvent(supabase, event);
      expect(result.success).toBe(true);
      expect(updates.length).toBe(1);
      expect(updates[0].data.status).toBe("PAST_DUE");
    });
  });
});
