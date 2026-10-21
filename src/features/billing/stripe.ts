import crypto from "node:crypto";
import { SubscriptionTier, PLANS } from "./plans";

export interface CreateCheckoutOptions {
  workspaceId: string;
  customerEmail?: string;
  tier: SubscriptionTier;
  returnUrl?: string;
}

export interface CreatePortalOptions {
  customerId: string;
  returnUrl?: string;
}

export interface WebhookVerificationOptions {
  rawBody: string;
  signatureHeader: string | null;
  webhookSecret: string;
  toleranceSeconds?: number;
}

/**
 * Creates a Stripe Checkout Session for upgrading plan subscriptions.
 * In development / test environments without active Stripe keys, safely provides
 * a simulated checkout URL so developers and automated tests can verify the flow.
 */
export async function createStripeCheckoutSession(
  options: CreateCheckoutOptions,
): Promise<{
  success: boolean;
  url?: string;
  sessionId?: string;
  error?: string;
}> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const appUrl =
    options.returnUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const isGenuineKey = Boolean(
    stripeSecretKey &&
    (stripeSecretKey.startsWith("sk_test_") ||
      stripeSecretKey.startsWith("sk_live_")) &&
    !stripeSecretKey.includes("sk_test_..."),
  );

  const plan = PLANS[options.tier] || PLANS.STARTER;

  if (isGenuineKey && process.env.NODE_ENV !== "test") {
    try {
      const params = new URLSearchParams();
      params.append("mode", "subscription");
      params.append(
        "success_url",
        `${appUrl}/dashboard/settings?checkout_success=true&session_id={CHECKOUT_SESSION_ID}`,
      );
      params.append(
        "cancel_url",
        `${appUrl}/dashboard/settings?checkout_cancelled=true`,
      );
      params.append("client_reference_id", options.workspaceId);
      if (options.customerEmail) {
        params.append("customer_email", options.customerEmail);
      }
      params.append(
        "line_items[0][price]",
        plan.stripePriceId || "price_starter_monthly",
      );
      params.append("line_items[0][quantity]", "1");
      params.append("metadata[workspace_id]", options.workspaceId);
      params.append("metadata[tier]", options.tier);

      const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          error: `Stripe HTTP ${res.status}: ${errorText}`,
        };
      }

      const session = (await res.json()) as { id: string; url: string };
      return {
        success: true,
        sessionId: session.id,
        url: session.url,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Stripe connection failed",
      };
    }
  }

  // Simulated fallback for testing and local development
  const mockSessionId = `cs_test_mock_${Date.now()}`;
  const mockCheckoutUrl = `${appUrl}/dashboard/settings?simulated_checkout=true&tier=${options.tier}&ws=${options.workspaceId}&session_id=${mockSessionId}`;

  return {
    success: true,
    sessionId: mockSessionId,
    url: mockCheckoutUrl,
  };
}

/**
 * Creates a Stripe Customer Billing Portal Session for managing subscriptions, cards, and invoices.
 */
export async function createStripeBillingPortalSession(
  options: CreatePortalOptions,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const appUrl =
    options.returnUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const isGenuineKey = Boolean(
    stripeSecretKey &&
    (stripeSecretKey.startsWith("sk_test_") ||
      stripeSecretKey.startsWith("sk_live_")) &&
    !stripeSecretKey.includes("sk_test_..."),
  );

  if (isGenuineKey && process.env.NODE_ENV !== "test") {
    try {
      const params = new URLSearchParams();
      params.append("customer", options.customerId);
      params.append("return_url", `${appUrl}/dashboard/settings`);

      const res = await fetch(
        "https://api.stripe.com/v1/billing_portal/sessions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        },
      );

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          error: `Stripe Portal HTTP ${res.status}: ${errorText}`,
        };
      }

      const portalSession = (await res.json()) as { url: string };
      return { success: true, url: portalSession.url };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Stripe connection failed",
      };
    }
  }

  // Simulated fallback
  return {
    success: true,
    url: `${appUrl}/dashboard/settings?simulated_portal=true`,
  };
}

/**
 * Verifies the raw HMAC-SHA256 signature on incoming Stripe webhooks.
 * Enforces constant-time comparison via crypto.timingSafeEqual and timestamp tolerance checks
 * against replay attacks.
 */
export function verifyStripeWebhookSignature(
  options: WebhookVerificationOptions,
): { valid: boolean; error?: string; timestamp?: number } {
  if (!options.signatureHeader) {
    return { valid: false, error: "Missing stripe-signature header." };
  }

  const tolerance = options.toleranceSeconds ?? 300; // 5 minutes tolerance
  const parts = options.signatureHeader.split(",").map((p) => p.trim());

  let timestampStr: string | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") timestampStr = value;
    if (key === "v1") signatures.push(value);
  }

  if (!timestampStr || signatures.length === 0) {
    return { valid: false, error: "Malformed stripe-signature header." };
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return { valid: false, error: "Invalid timestamp in signature header." };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > tolerance) {
    return {
      valid: false,
      error: `Signature timestamp expired or clock skew exceeded tolerance (${tolerance}s).`,
      timestamp,
    };
  }

  const signedPayload = `${timestamp}.${options.rawBody}`;
  const expectedSignature = crypto
    .createHmac("sha256", options.webhookSecret)
    .update(signedPayload)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf-8");

  // Constant-time comparison against each v1 signature provided
  let hasValidSignature = false;
  for (const sig of signatures) {
    const sigBuffer = Buffer.from(sig, "utf-8");
    if (
      sigBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      hasValidSignature = true;
      break;
    }
  }

  if (!hasValidSignature) {
    return {
      valid: false,
      error: "Signature verification failed: HMAC mismatch.",
      timestamp,
    };
  }

  return { valid: true, timestamp };
}
