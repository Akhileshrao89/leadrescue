"use client";

import * as React from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { MOCK_LEADS, DEMO_DATA_DISCLAIMER } from "@/features/leads/fixtures";
import { formatDate, getFollowUpStatus } from "@/lib/utils";
import {
  Clock,
  AlertCircle,
  CheckCircle,
  Users,
  PlusCircle,
  ArrowRight,
  Phone,
  Mail,
  CalendarCheck,
  Zap,
} from "lucide-react";
import {
  fetchWorkspaceLeads,
  completeFollowUpAction,
} from "@/features/leads/actions";
import { Lead } from "@/features/leads/types";
import {
  triggerWorkerTickAction,
  fetchUpcomingRemindersAction,
} from "@/features/reminders/actions";
import { Reminder } from "@/features/reminders/types";

export default function DashboardOverviewPage() {
  const [leads, setLeads] = React.useState<Lead[]>(MOCK_LEADS);
  const [reminders, setReminders] = React.useState<Reminder[]>([]);
  const [isLiveDatabase, setIsLiveDatabase] = React.useState(false);
  const [isWorkerRunning, setIsWorkerRunning] = React.useState(false);
  const [actionMessage, setActionMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const result = await fetchWorkspaceLeads({
          stage: "ALL",
          queue: "ALL",
        });
        if (mounted && result.leads && result.leads.length > 0) {
          setLeads(result.leads);
          setIsLiveDatabase(true);
        }

        const reminderRes = await fetchUpcomingRemindersAction({ limit: 10 });
        if (mounted && reminderRes.success && reminderRes.data) {
          setReminders(reminderRes.data);
        }
      } catch {
        // Fall back to local fixtures in dev
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  // Compute metrics
  const overdueLeads = leads.filter(
    (l) => getFollowUpStatus(l.nextFollowUpAt).label === "Overdue",
  );
  const dueTodayLeads = leads.filter(
    (l) => getFollowUpStatus(l.nextFollowUpAt).label === "Due Today",
  );
  const urgentQueue = [...overdueLeads, ...dueTodayLeads];
  const wonLeads = leads.filter((l) => l.stage === "WON");

  async function handleCompleteFollowUp(leadId: string) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 3);
    const nextDate = targetDate.toISOString();
    const completedAt = new Date().toISOString();

    if (isLiveDatabase) {
      const res = await completeFollowUpAction(
        leadId,
        "Follow-up completed from dashboard queue",
        nextDate,
      );
      if (res.success) {
        setActionMessage(
          "Follow-up completed and recorded in database! Follow-up moved to +3 days.",
        );
      } else {
        setActionMessage(`Error: ${res.error || "Failed to update"}`);
      }
    } else {
      setActionMessage(
        "Follow-up completed in demo state! Follow-up moved to +3 days.",
      );
    }

    setLeads((prev) =>
      prev.map((l) => {
        if (l.id === leadId) {
          return {
            ...l,
            stage: "CONTACTED",
            lastContactedAt: completedAt,
            nextFollowUpAt: nextDate,
          };
        }
        return l;
      }),
    );

    setTimeout(() => setActionMessage(null), 3000);
  }

  async function handleRunWorker() {
    setIsWorkerRunning(true);
    try {
      const res = await triggerWorkerTickAction(10);
      if (res.success && res.data) {
        const d = res.data;
        setActionMessage(
          `Outbox worker completed: Claimed ${d.claimedCount}, Succeeded ${d.succeededCount}, Failed ${d.failedCount} (${d.durationMs}ms)`,
        );
        const reminderRes = await fetchUpcomingRemindersAction({ limit: 10 });
        if (reminderRes.success && reminderRes.data) {
          setReminders(reminderRes.data);
        }
      } else {
        setActionMessage(
          `Worker error: ${res.error || "Failed to execute worker tick"}`,
        );
      }
    } catch {
      setActionMessage("Background worker execution completed.");
    } finally {
      setIsWorkerRunning(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  }

  return (
    <DashboardShell isLiveDatabase={isLiveDatabase}>
      <div className="space-y-8">
        {/* Header & Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Agency Overview
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Welcome back. Here are the prospects requiring immediate agency
              touchpoints today.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRunWorker}
              disabled={isWorkerRunning}
              className="gap-2 text-xs"
            >
              <Zap
                className={`h-4 w-4 ${isWorkerRunning ? "animate-spin text-amber-500" : "text-amber-600"}`}
              />
              <span>
                {isWorkerRunning ? "Processing Outbox..." : "Run Outbox Worker"}
              </span>
            </Button>

            <Link href="/dashboard/leads/new">
              <Button size="sm" className="gap-2">
                <PlusCircle className="h-4 w-4" />
                <span>Create Lead</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Action feedback toast */}
        {actionMessage && (
          <div className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 p-3 text-xs text-emerald-800 dark:text-emerald-300 font-medium animate-in fade-in-50">
            {actionMessage}
          </div>
        )}

        {/* Pipeline Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/20">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-red-700 dark:text-red-400 font-semibold text-xs uppercase tracking-wider">
                  Overdue
                </CardDescription>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
              <CardTitle className="text-3xl font-extrabold text-red-600 dark:text-red-400">
                {overdueLeads.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-zinc-500">
              Past scheduled follow-up
            </CardContent>
          </Card>

          <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/20">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-amber-700 dark:text-amber-400 font-semibold text-xs uppercase tracking-wider">
                  Due Today
                </CardDescription>
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <CardTitle className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">
                {dueTodayLeads.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-zinc-500">
              Ready for client outreach
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-xs uppercase tracking-wider font-semibold">
                  Active Pipeline
                </CardDescription>
                <Users className="h-4 w-4 text-zinc-400" />
              </div>
              <CardTitle className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-100">
                {leads.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-zinc-500">
              Total managed prospects
            </CardContent>
          </Card>

          <Card className="border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/20">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-emerald-700 dark:text-emerald-400 font-semibold text-xs uppercase tracking-wider">
                  Won Deals
                </CardDescription>
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </div>
              <CardTitle className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {wonLeads.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-xs text-zinc-500">
              Closed client contracts
            </CardContent>
          </Card>
        </div>

        {/* Priority Action Queue: Overdue & Due Today */}
        <Card className="shadow-xs">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">
                  Follow-Up Action Queue (Due Today & Overdue)
                </CardTitle>
              </div>
              <CardDescription className="mt-1">
                Leads requiring outreach today to prevent deals from going cold.
              </CardDescription>
            </div>
            <Link href="/dashboard/leads">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                <span>View Full Pipeline</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardHeader>

          <CardContent className="p-0">
            {urgentQueue.length === 0 ? (
              <div className="py-12 text-center text-sm text-zinc-500">
                🎉 No overdue or pending follow-ups due today! You are all
                caught up.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prospect / Agency</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Latest Context & Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {urgentQueue.map((lead) => {
                    const statusInfo = getFollowUpStatus(lead.nextFollowUpAt);
                    return (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <Link
                            href={`/dashboard/leads/${lead.id}`}
                            className="font-semibold text-zinc-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline block"
                          >
                            {lead.firstName} {lead.lastName}
                          </Link>
                          <div className="text-xs text-zinc-500">
                            {lead.companyName || "No Company"}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400">
                            {lead.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {lead.email}
                              </span>
                            )}
                            {lead.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {lead.phone}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              lead.stage.toLowerCase() as
                                | "new"
                                | "contacted"
                                | "qualified"
                                | "proposal"
                                | "won"
                                | "lost"
                            }
                          >
                            {lead.stage}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusInfo.variant}>
                            {statusInfo.label}
                          </Badge>
                          <div className="text-[11px] text-zinc-400 mt-1">
                            {formatDate(lead.nextFollowUpAt)}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2">
                            {lead.notes || "No notes recorded yet."}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleCompleteFollowUp(lead.id)}
                            className="text-xs"
                          >
                            Mark Done (+3d)
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Outbox & Reminders Status Card */}
        {reminders.length > 0 && (
          <Card className="shadow-xs">
            <CardHeader className="border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span>Scheduled Follow-Up Reminders</span>
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Background jobs enqueued in transactional outbox for
                    automated notification delivery.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {reminders.filter((r) => r.status === "QUEUED").length}{" "}
                  Pending
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reminder ID / Target</TableHead>
                    <TableHead>Due At</TableHead>
                    <TableHead>Outbox Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reminders.map((rem) => (
                    <TableRow key={rem.id}>
                      <TableCell className="font-mono text-xs">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {rem.id.slice(0, 8)}...
                        </span>
                        <div className="text-[11px] text-zinc-400">
                          Key: {rem.idempotencyKey.slice(0, 18)}...
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatDate(rem.dueAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            rem.status === "SENT"
                              ? "qualified"
                              : rem.status === "QUEUED"
                                ? "proposal"
                                : rem.status === "CANCELLED"
                                  ? "lost"
                                  : "destructive"
                          }
                          className="text-[11px]"
                        >
                          {rem.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {formatDate(rem.updatedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Demo Disclaimer Box (Only shown if running local demo fixtures) */}
        {!isLiveDatabase && (
          <p className="text-xs text-zinc-400 text-center italic">
            {DEMO_DATA_DISCLAIMER}
          </p>
        )}
      </div>
    </DashboardShell>
  );
}
