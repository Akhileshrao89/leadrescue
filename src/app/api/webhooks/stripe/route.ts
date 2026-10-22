import { NextRequest, NextResponse } from "next/server";
import { verifyStripeWebhookSignature } from "@/features/billing/stripe";
import {
  handleStripeWebhookEvent,
  StripeEventPayload,
} from "@/features/billing/webhook-handler";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const signatureHeader = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Could not read request body" },
      { status: 400 },
    );
  }

  // Verify the signature in constant time when a webhook secret is configured.
  if (webhookSecret) {
    const verification = verifyStripeWebhookSignature({
      rawBody,
      signatureHeader,
      webhookSecret,
    });

    if (!verification.valid) {
      return NextResponse.json(
        { error: verification.error || "Invalid webhook signature" },
        { status: 400 },
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    // In production, reject webhooks if secret is missing
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured on server" },
      { status: 500 },
    );
  }

  let event: StripeEventPayload;
  try {
    event = JSON.parse(rawBody) as StripeEventPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  if (!event || !event.type || !event.id) {
    return NextResponse.json(
      { error: "Malformed Stripe event schema" },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    // Never acknowledge a production payment event that was not persisted.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        {
          error: "Billing database is not configured; event was not persisted.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({
      received: true,
      event: event.type,
      note: "Development/test only: database client is not configured.",
    });
  }

  const processResult = await handleStripeWebhookEvent(supabase, event);

  if (!processResult.success) {
    return NextResponse.json(
      { error: processResult.error || "Failed to process Stripe event" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    received: true,
    handled: processResult.handled,
    eventId: event.id,
    type: event.type,
  });
}
