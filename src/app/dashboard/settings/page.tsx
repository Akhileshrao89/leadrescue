"use client";

import * as React from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Settings,
  CreditCard,
  Users,
  CheckCircle2,
  ExternalLink,
  Zap,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import {
  fetchSubscriptionAction,
  createCheckoutSessionAction,
  createBillingPortalAction,
  type WorkspaceSubscriptionDetails,
} from "@/features/billing/actions";
import { PLANS, SubscriptionTier } from "@/features/billing/plans";

export default function WorkspaceSettingsPage() {
  const [workspaceName, setWorkspaceName] = React.useState("Acme Web & SEO");
  const [workspaceSlug, setWorkspaceSlug] = React.useState("acme-web-seo");
  const [timezone, setTimezone] = React.useState("America/New_York");
  const [isSaved, setIsSaved] = React.useState(false);

  // Billing state
  const [subscription, setSubscription] =
    React.useState<WorkspaceSubscriptionDetails>({
      tier: "FREE",
      status: "ACTIVE",
      maxActiveLeads: PLANS.FREE.maxActiveLeads,
      maxMembers: PLANS.FREE.maxMembers,
      aiDraftsUsed: 0,
      monthlyAiDraftsQuota: PLANS.FREE.monthlyAiDraftsQuota,
      activeLeadsCount: 0,
      currentPeriodEnd: null,
      externalCustomerId: null,
      externalSubscriptionId: null,
    });
  const [isLoadingSub, setIsLoadingSub] = React.useState(true);
  const [upgradingTier, setUpgradingTier] =
    React.useState<SubscriptionTier | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = React.useState(false);
  const [billingNotice, setBillingNotice] = React.useState<{
    type: "success" | "warning";
    message: string;
  } | null>(null);

  React.useEffect(() => {
    async function loadData() {
      setIsLoadingSub(true);
      const res = await fetchSubscriptionAction();
      if (res.success) {
        setSubscription(res.subscription);
      }
      setIsLoadingSub(false);

      // Check URL parameters for Stripe redirects
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (
          params.get("checkout_success") ||
          params.get("simulated_checkout")
        ) {
          setBillingNotice({
            type: "success",
            message:
              "Checkout completed! Your subscription and quota ceilings have been updated.",
          });
        } else if (params.get("checkout_cancelled")) {
          setBillingNotice({
            type: "warning",
            message:
              "Subscription checkout was cancelled. No charges were made.",
          });
        }
      }
    }
    loadData();
  }, []);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  }

  async function handleUpgrade(tier: SubscriptionTier) {
    setUpgradingTier(tier);
    try {
      const res = await createCheckoutSessionAction(tier);
      if (res.success) {
        window.location.href = res.url;
      } else {
        alert(res.error || "Failed to initialize checkout.");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Checkout error");
    } finally {
      setUpgradingTier(null);
    }
  }

  async function handleOpenPortal() {
    setIsOpeningPortal(true);
    try {
      const res = await createBillingPortalAction();
      if (res.success) {
        window.location.href = res.url;
      } else {
        alert(res.error || "Failed to access billing portal.");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Billing portal error");
    } finally {
      setIsOpeningPortal(false);
    }
  }

  const currentPlan = PLANS[subscription.tier] || PLANS.FREE;
  const leadUsagePct = Math.min(
    100,
    Math.round(
      (subscription.activeLeadsCount / (subscription.maxActiveLeads || 1)) *
        100,
    ),
  );
  const aiDraftsUsagePct = Math.min(
    100,
    Math.round(
      (subscription.aiDraftsUsed / (subscription.monthlyAiDraftsQuota || 1)) *
        100,
    ),
  );

  return (
    <DashboardShell>
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Workspace Settings
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Manage your agency details, team roles, timezone, and subscription
            plan limits.
          </p>
        </div>

        {billingNotice && (
          <Alert
            variant={
              billingNotice.type === "success" ? "success" : "destructive"
            }
          >
            {billingNotice.type === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertTitle>
              {billingNotice.type === "success"
                ? "Billing Update"
                : "Checkout Alert"}
            </AlertTitle>
            <AlertDescription>{billingNotice.message}</AlertDescription>
          </Alert>
        )}

        {isSaved && (
          <Alert variant="success">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Settings Saved</AlertTitle>
            <AlertDescription>
              Workspace preferences updated successfully.
            </AlertDescription>
          </Alert>
        )}

        {/* Agency Profile */}
        <Card className="shadow-xs">
          <form onSubmit={handleSave}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Agency Details</CardTitle>
              </div>
              <CardDescription>
                Basic identifiers for your multi-tenant workspace.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="wsName" required>
                    Agency Name
                  </Label>
                  <Input
                    id="wsName"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="wsSlug" required>
                    Workspace Slug
                  </Label>
                  <Input
                    id="wsSlug"
                    value={workspaceSlug}
                    onChange={(e) => setWorkspaceSlug(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="timezone" required>
                  Agency Timezone (IANA)
                </Label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="America/New_York">
                    America/New_York (Eastern Time)
                  </option>
                  <option value="America/Chicago">
                    America/Chicago (Central Time)
                  </option>
                  <option value="America/Denver">
                    America/Denver (Mountain Time)
                  </option>
                  <option value="America/Los_Angeles">
                    America/Los_Angeles (Pacific Time)
                  </option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                </select>
                <p className="mt-1 text-xs text-zinc-400">
                  Used to calculate the local bounds for the daily &quot;Due
                  Today&quot; follow-up queue.
                </p>
              </div>
            </CardContent>

            <CardFooter className="flex justify-end border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <Button type="submit">Save Workspace Changes</Button>
            </CardFooter>
          </form>
        </Card>

        {/* Subscription & Entitlements Status */}
        <Card className="shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">
                  Plan Entitlements & Live Quotas
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    subscription.tier === "AGENCY"
                      ? "default"
                      : subscription.tier === "STARTER"
                        ? "secondary"
                        : "outline"
                  }
                  className="text-xs font-semibold"
                >
                  {currentPlan.name}
                </Badge>
                {subscription.status !== "ACTIVE" && (
                  <Badge variant="destructive" className="text-xs uppercase">
                    {subscription.status}
                  </Badge>
                )}
              </div>
            </div>
            <CardDescription>
              Hard limits enforced server-side against unauthorized resource
              exhaustion.
            </CardDescription>
          </CardHeader>

          <CardContent
            className={`space-y-6 transition-opacity ${
              isLoadingSub ? "opacity-60" : "opacity-100"
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40">
                <div className="flex justify-between items-center text-zinc-500 font-medium">
                  <span>Active Leads</span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {leadUsagePct}%
                  </span>
                </div>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                  {subscription.activeLeadsCount} /{" "}
                  {subscription.maxActiveLeads}
                </p>
                <div className="w-full bg-zinc-200 rounded-full h-2 mt-2 dark:bg-zinc-700 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      leadUsagePct >= 90 ? "bg-amber-500" : "bg-blue-600"
                    }`}
                    style={{ width: `${leadUsagePct}%` }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40">
                <div className="flex justify-between items-center text-zinc-500 font-medium">
                  <span>Team Seats</span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {Math.round((1 / (subscription.maxMembers || 1)) * 100)}%
                  </span>
                </div>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                  1 / {subscription.maxMembers}
                </p>
                <div className="w-full bg-zinc-200 rounded-full h-2 mt-2 dark:bg-zinc-700 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-2 rounded-full"
                    style={{
                      width: `${Math.round((1 / (subscription.maxMembers || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40">
                <div className="flex justify-between items-center text-zinc-500 font-medium">
                  <span>Monthly AI Drafts</span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {aiDraftsUsagePct}%
                  </span>
                </div>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                  {subscription.aiDraftsUsed} /{" "}
                  {subscription.monthlyAiDraftsQuota}
                </p>
                <div className="w-full bg-zinc-200 rounded-full h-2 mt-2 dark:bg-zinc-700 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      aiDraftsUsagePct >= 90 ? "bg-amber-500" : "bg-purple-600"
                    }`}
                    style={{ width: `${aiDraftsUsagePct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Plan Tier Selection Cards */}
            <div className="pt-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
                Available Plan Upgrades
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Starter Plan */}
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    subscription.tier === "STARTER"
                      ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/20"
                      : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Starter Plan
                      </h4>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {PLANS.STARTER.tagline}
                      </p>
                    </div>
                    <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      $49
                      <span className="text-xs font-normal text-zinc-500">
                        /mo
                      </span>
                    </span>
                  </div>

                  <ul className="mt-3 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    {PLANS.STARTER.features.slice(0, 3).map((f) => (
                      <li key={f} className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4">
                    {subscription.tier === "STARTER" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled
                        className="w-full text-xs"
                      >
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full text-xs"
                        isLoading={upgradingTier === "STARTER"}
                        disabled={
                          Boolean(upgradingTier) ||
                          subscription.tier === "AGENCY"
                        }
                        onClick={() => handleUpgrade("STARTER")}
                      >
                        <Zap className="h-3.5 w-3.5 mr-1" />
                        {subscription.tier === "AGENCY"
                          ? "Managed via Portal"
                          : "Upgrade to Starter"}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Agency Plan */}
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    subscription.tier === "AGENCY"
                      ? "border-purple-500 bg-purple-50/40 dark:bg-purple-950/20"
                      : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Agency Plan
                      </h4>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {PLANS.AGENCY.tagline}
                      </p>
                    </div>
                    <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      $149
                      <span className="text-xs font-normal text-zinc-500">
                        /mo
                      </span>
                    </span>
                  </div>

                  <ul className="mt-3 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    {PLANS.AGENCY.features.slice(0, 3).map((f) => (
                      <li key={f} className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4">
                    {subscription.tier === "AGENCY" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled
                        className="w-full text-xs"
                      >
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full text-xs bg-purple-600 hover:bg-purple-700 text-white"
                        isLoading={upgradingTier === "AGENCY"}
                        disabled={Boolean(upgradingTier)}
                        onClick={() => handleUpgrade("AGENCY")}
                      >
                        <Zap className="h-3.5 w-3.5 mr-1" />
                        Upgrade to Agency
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-4 gap-3 text-xs text-zinc-500">
            <span>
              Secure billing powered by Stripe. Downgrades and invoices can be
              managed in your portal.
            </span>
            <Button
              variant="outline"
              size="sm"
              isLoading={isOpeningPortal}
              onClick={handleOpenPortal}
              className="text-xs shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Manage Billing & Cards
            </Button>
          </CardFooter>
        </Card>

        {/* Team Members List */}
        <Card className="shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Agency Team Members</CardTitle>
              </div>
              <Button size="sm" variant="outline" disabled>
                + Invite Colleague (Phase 4)
              </Button>
            </div>
            <CardDescription>
              Role-Based Access Control (Owner, Admin, Member) enforced per
              workspace.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">John Doe</TableCell>
                  <TableCell className="text-zinc-500 text-xs">
                    john@acmedesign.example
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">OWNER</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-emerald-600 font-medium">
                    Active (You)
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
