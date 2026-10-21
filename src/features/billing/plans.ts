export type SubscriptionTier = "FREE" | "STARTER" | "AGENCY";

export type SubscriptionStatus =
  "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIALING";

export interface PlanDefinition {
  tier: SubscriptionTier;
  name: string;
  tagline: string;
  priceMonthly: number;
  maxActiveLeads: number;
  maxMembers: number;
  monthlyAiDraftsQuota: number;
  stripePriceId?: string;
  features: string[];
}

export const PLANS: Record<SubscriptionTier, PlanDefinition> = {
  FREE: {
    tier: "FREE",
    name: "Free Tier",
    tagline: "Essential deal rescue for solo founders and freelancers",
    priceMonthly: 0,
    maxActiveLeads: 100,
    maxMembers: 2,
    monthlyAiDraftsQuota: 20,
    features: [
      "100 Active Managed Prospects",
      "2 Workspace Team Seats",
      "20 Monthly AI Follow-Up Drafts",
      "Deterministic Instant Templates (<10ms)",
      "Standard CSV Pipeline (10MB)",
      "Follow-up Queue & Overdue Alarms",
    ],
  },
  STARTER: {
    tier: "STARTER",
    name: "Starter Tier",
    tagline: "Ideal for growing boutique web design & SEO agencies",
    priceMonthly: 29,
    stripePriceId:
      process.env.STRIPE_STARTER_PRICE_ID || "price_starter_monthly",
    maxActiveLeads: 500,
    maxMembers: 5,
    monthlyAiDraftsQuota: 100,
    features: [
      "500 Active Managed Prospects",
      "5 Workspace Team Seats",
      "100 Monthly AI Follow-Up Drafts",
      "Automated Resend Email Reminders",
      "Priority Outbox Background Worker",
      "CSV Import Duplicate Conflict Resolution",
    ],
  },
  AGENCY: {
    tier: "AGENCY",
    name: "Agency Tier",
    tagline: "High-volume follow-up powerhouse for multi-agent agencies",
    priceMonthly: 79,
    stripePriceId: process.env.STRIPE_AGENCY_PRICE_ID || "price_agency_monthly",
    maxActiveLeads: 2500,
    maxMembers: 15,
    monthlyAiDraftsQuota: 500,
    features: [
      "2,500 Active Managed Prospects",
      "15 Workspace Team Seats",
      "500 Monthly AI Follow-Up Drafts",
      "High-Throughput SKIP LOCKED Worker",
      "Custom Branding & White-Label Drafts",
      "Priority SLA & Dedicated Support",
    ],
  },
};

export function getPlanByTier(tier: string | null | undefined): PlanDefinition {
  if (!tier) return PLANS.FREE;
  const upper = tier.toUpperCase() as SubscriptionTier;
  return PLANS[upper] || PLANS.FREE;
}

export function getTierByPriceId(
  priceId: string | null | undefined,
): SubscriptionTier {
  if (!priceId) return "FREE";
  if (priceId === PLANS.AGENCY.stripePriceId || priceId.includes("agency")) {
    return "AGENCY";
  }
  if (priceId === PLANS.STARTER.stripePriceId || priceId.includes("starter")) {
    return "STARTER";
  }
  return "FREE";
}
