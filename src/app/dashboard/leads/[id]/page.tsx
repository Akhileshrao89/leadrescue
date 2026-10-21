"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  fetchLeadByIdAction,
  updateLeadStageAction,
  completeFollowUpAction,
  rescheduleFollowUpAction,
  addLeadNoteAction,
  archiveLeadAction,
  deleteLeadAction,
} from "@/features/leads/actions";
import { Lead, LeadActivity, LeadStage } from "@/features/leads/types";
import { getAllowedTransitions } from "@/features/leads/state-machine";
import { formatDate, getFollowUpStatus } from "@/lib/utils";
import { AiDraftAssistant } from "@/components/leads/ai-draft-assistant";
import { AgenticMissionControl } from "@/components/leads/agentic-mission-control";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Mail,
  Phone,
  Globe,
  AlertCircle,
  Archive,
  Trash2,
  FileText,
  Building,
} from "lucide-react";

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const [lead, setLead] = React.useState<Lead | null>(null);
  const [activities, setActivities] = React.useState<LeadActivity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);

  // Forms state
  const [newNote, setNewNote] = React.useState("");
  const [outcomeNote, setOutcomeNote] = React.useState("");
  const [nextFollowUpDate, setNextFollowUpDate] = React.useState("");
  const [rescheduleDate, setRescheduleDate] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const reloadLead = React.useCallback(async () => {
    try {
      const res = await fetchLeadByIdAction(leadId);
      if (res.error || !res.lead) {
        setError(res.error || "Lead not found");
      } else {
        setLead(res.lead);
        setActivities(res.activities);
      }
    } catch {
      setError("Failed to load lead details.");
    }
  }, [leadId]);

  React.useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const res = await fetchLeadByIdAction(leadId);
        if (!isMounted) return;
        if (res.error || !res.lead) {
          setError(res.error || "Lead not found");
        } else {
          setLead(res.lead);
          setActivities(res.activities);
        }
      } catch {
        if (isMounted) setError("Failed to load lead details.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [leadId]);

  const handleStageChange = async (targetStage: LeadStage) => {
    if (!lead) return;
    setIsSubmitting(true);
    setActionSuccess(null);
    setError(null);

    const res = await updateLeadStageAction(lead.id, targetStage, lead.version);
    setIsSubmitting(false);

    if (res.success) {
      setActionSuccess(`Lead stage advanced to ${targetStage}`);
      reloadLead();
    } else {
      setError(res.error || "Failed to update stage");
    }
  };

  const handleCompleteFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !outcomeNote.trim()) return;

    setIsSubmitting(true);
    setActionSuccess(null);
    setError(null);

    const res = await completeFollowUpAction(
      lead.id,
      outcomeNote.trim(),
      nextFollowUpDate || null,
    );
    setIsSubmitting(false);

    if (res.success) {
      setActionSuccess("Follow-up completed and logged in activity timeline.");
      setOutcomeNote("");
      setNextFollowUpDate("");
      reloadLead();
    } else {
      setError(res.error || "Failed to complete follow-up");
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !rescheduleDate) return;

    setIsSubmitting(true);
    setActionSuccess(null);
    setError(null);

    const res = await rescheduleFollowUpAction(lead.id, rescheduleDate);
    setIsSubmitting(false);

    if (res.success) {
      setActionSuccess("Follow-up rescheduled successfully.");
      setRescheduleDate("");
      reloadLead();
    } else {
      setError(res.error || "Failed to reschedule");
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead || !newNote.trim()) return;

    setIsSubmitting(true);
    setActionSuccess(null);
    setError(null);

    const res = await addLeadNoteAction(lead.id, newNote.trim());
    setIsSubmitting(false);

    if (res.success) {
      setActionSuccess("Note added to timeline.");
      setNewNote("");
      reloadLead();
    } else {
      setError(res.error || "Failed to add note");
    }
  };

  const handleArchive = async () => {
    if (!lead) return;
    setIsSubmitting(true);
    const res = await archiveLeadAction(lead.id);
    setIsSubmitting(false);

    if (res.success) {
      setActionSuccess("Lead archived.");
      reloadLead();
    } else {
      setError(res.error || "Failed to archive lead");
    }
  };

  const handleDelete = async () => {
    if (!lead) return;
    if (!confirm("Are you sure you want to permanently delete this lead?"))
      return;

    setIsSubmitting(true);
    const res = await deleteLeadAction(lead.id);
    setIsSubmitting(false);

    if (res.success) {
      router.push("/dashboard/leads");
    } else {
      setError(res.error || "Failed to delete lead");
    }
  };

  if (loading) {
    return (
      <DashboardShell isLiveDatabase={true}>
        <div className="flex items-center justify-center min-h-[400px]">
          <Spinner className="h-8 w-8 text-blue-600" />
        </div>
      </DashboardShell>
    );
  }

  if (error && !lead) {
    return (
      <DashboardShell isLiveDatabase={true}>
        <div className="max-w-xl mx-auto py-12 text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Lead Not Found
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{error}</p>
          <Link href="/dashboard/leads">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Leads</span>
            </Button>
          </Link>
        </div>
      </DashboardShell>
    );
  }

  if (!lead) return null;

  const followUpStatus = getFollowUpStatus(lead.nextFollowUpAt);
  const allowedNextStages = getAllowedTransitions(lead.stage);

  return (
    <DashboardShell isLiveDatabase={true}>
      <div className="space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/leads">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                <span>All Leads</span>
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                {lead.firstName} {lead.lastName || ""}
              </h1>
              {lead.companyName && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-0.5">
                  <Building className="h-3.5 w-3.5" />
                  {lead.companyName}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleArchive}
              disabled={isSubmitting}
              className="gap-1.5 text-zinc-700 dark:text-zinc-300"
            >
              <Archive className="h-4 w-4" />
              <span>Archive</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </Button>
          </div>
        </div>

        {/* Feedback Alerts */}
        {actionSuccess && (
          <Alert
            variant="success"
            className="border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200"
          >
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <AlertDescription>{actionSuccess}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Stage Transition Control Card */}
        <Card className="border-blue-200 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-950/10">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Current Pipeline Stage:
                  </span>
                  <Badge variant="outline" className="font-semibold text-sm">
                    {lead.stage}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Enforces validated lifecycle transitions.
                </p>
              </div>

              {allowedNextStages.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-500 mr-1">
                    Advance to:
                  </span>
                  {allowedNextStages.map((target) => (
                    <Button
                      key={target}
                      size="sm"
                      variant={
                        target === "WON"
                          ? "primary"
                          : target === "LOST"
                            ? "outline"
                            : "secondary"
                      }
                      onClick={() => handleStageChange(target)}
                      disabled={isSubmitting}
                      className={
                        target === "WON"
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                          : ""
                      }
                    >
                      {target}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main Grid: Details & Follow-up Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2 Cols): Contact Info & Follow-up Execution */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Details Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Contact Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <span className="text-xs text-zinc-500">Email Address</span>
                    <div className="flex items-center gap-2 font-medium">
                      <Mail className="h-4 w-4 text-zinc-400" />
                      {lead.email ? (
                        <a
                          href={`mailto:${lead.email}`}
                          className="text-blue-600 hover:underline"
                        >
                          {lead.email}
                        </a>
                      ) : (
                        <span className="text-zinc-400">Not provided</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-zinc-500">Phone Number</span>
                    <div className="flex items-center gap-2 font-medium">
                      <Phone className="h-4 w-4 text-zinc-400" />
                      {lead.phone ? (
                        <a
                          href={`tel:${lead.phone}`}
                          className="text-blue-600 hover:underline"
                        >
                          {lead.phone}
                        </a>
                      ) : (
                        <span className="text-zinc-400">Not provided</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-zinc-500">Website</span>
                    <div className="flex items-center gap-2 font-medium">
                      <Globe className="h-4 w-4 text-zinc-400" />
                      {lead.website ? (
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {lead.website}
                        </a>
                      ) : (
                        <span className="text-zinc-400">Not provided</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-zinc-500">Lead Source</span>
                    <div className="font-medium capitalize text-zinc-700 dark:text-zinc-300">
                      {lead.source || "Manual"}
                    </div>
                  </div>
                </div>

                {lead.notes && (
                  <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    <span className="text-xs text-zinc-500 block mb-1">
                      Initial Notes / Context
                    </span>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-md">
                      {lead.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Autonomous Re-Engagement Agent Copilot */}
            <AgenticMissionControl
              lead={lead}
              onPlanExecuted={() => reloadLead()}
            />

            {/* AI Follow-Up Message Drafting Assistant */}
            <AiDraftAssistant
              workspaceId={lead.workspaceId}
              leadId={lead.id}
              leadName={`${lead.firstName} ${lead.lastName || ""}`.trim()}
              onApplyDraftToNote={(draftText) =>
                setOutcomeNote((prev) =>
                  prev ? `${prev}\n\n${draftText}` : draftText,
                )
              }
            />

            {/* Complete Follow-up Form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <span>Log Follow-Up Outcome</span>
                </CardTitle>
                <CardDescription>
                  Record the result of your conversation, mark follow-up
                  complete, and schedule next steps.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCompleteFollowUp} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="outcomeNote">
                      Follow-Up Note / Outcome
                    </Label>
                    <textarea
                      id="outcomeNote"
                      rows={3}
                      value={outcomeNote}
                      onChange={(e) => setOutcomeNote(e.target.value)}
                      placeholder="e.g. Spoke with Sarah. She reviewed the audit and wants a pricing proposal on Tuesday."
                      className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="nextFollowUp">
                        Next Follow-Up Date (Optional)
                      </Label>
                      <Input
                        id="nextFollowUp"
                        type="date"
                        value={nextFollowUpDate}
                        onChange={(e) => setNextFollowUpDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting || !outcomeNote.trim()}
                    className="gap-2"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <span>Complete & Log Follow-Up</span>
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Reschedule Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500" />
                  <span>Reschedule Follow-Up</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleReschedule}
                  className="flex flex-col sm:flex-row items-end gap-3"
                >
                  <div className="space-y-1.5 flex-1 w-full">
                    <Label htmlFor="rescheduleDate">New Follow-Up Date</Label>
                    <Input
                      id="rescheduleDate"
                      type="date"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={isSubmitting || !rescheduleDate}
                  >
                    Reschedule
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Right Column (1 Col): Activity Timeline & Quick Note */}
          <div className="space-y-6">
            {/* Follow-up Status Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
                  Follow-Up Queue Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Status:
                  </span>
                  <Badge variant={followUpStatus.variant}>
                    {followUpStatus.label}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Next Date:
                  </span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {lead.nextFollowUpAt
                      ? formatDate(lead.nextFollowUpAt)
                      : "Unscheduled"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Last Contact:
                  </span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {lead.lastContactedAt
                      ? formatDate(lead.lastContactedAt)
                      : "Never"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Quick Add Note Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span>Add Note</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddNote} className="space-y-3">
                  <textarea
                    rows={2}
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Log a call, meeting, or internal note..."
                    className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSubmitting || !newNote.trim()}
                    className="w-full"
                  >
                    Post Note
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Immutable Activity Timeline Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Activity History
                </CardTitle>
                <CardDescription>
                  Immutable audit trail of notes, stage changes, and follow-ups.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activities.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">
                    No activity recorded yet.
                  </p>
                ) : (
                  <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200 dark:before:bg-zinc-800">
                    {activities.map((act) => (
                      <div key={act.id} className="relative group text-sm">
                        <span className="absolute -left-6 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 ring-4 ring-white dark:ring-zinc-950" />
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                              {act.type.replace(/_/g, " ")}
                            </span>
                            <span className="text-[11px] text-zinc-400">
                              {formatDate(act.createdAt)}
                            </span>
                          </div>

                          {act.type === "STAGE_CHANGED" && (
                            <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1">
                              Stage advanced from{" "}
                              <span className="font-semibold">
                                {act.details.old_stage as string}
                              </span>{" "}
                              to{" "}
                              <span className="font-semibold text-blue-600">
                                {act.details.new_stage as string}
                              </span>
                            </p>
                          )}

                          {act.type === "FOLLOW_UP_COMPLETED" && (
                            <p className="text-xs text-zinc-700 dark:text-zinc-300 mt-1 bg-zinc-50 dark:bg-zinc-900 p-2 rounded">
                              {act.details.outcome_note as string}
                            </p>
                          )}

                          {act.type === "NOTE_ADDED" && (
                            <p className="text-xs text-zinc-700 dark:text-zinc-300 mt-1 bg-zinc-50 dark:bg-zinc-900 p-2 rounded">
                              {(act.details.note as string) ||
                                (act.details.notes_snippet as string) ||
                                (act.details.action as string)}
                            </p>
                          )}

                          {act.type === "FOLLOW_UP_SCHEDULED" && (
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                              Scheduled for{" "}
                              {formatDate(
                                act.details.new_scheduled_at as string,
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
