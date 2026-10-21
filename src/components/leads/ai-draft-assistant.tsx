"use client";

import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Sparkles, Copy, Check, ShieldCheck, RefreshCw } from "lucide-react";
import {
  generateFollowUpDraftAction,
  fetchDraftQuotaAction,
} from "@/features/ai-drafts/actions";
import { TouchpointType, DraftTone } from "@/features/ai-drafts/types";

export interface AiDraftAssistantProps {
  workspaceId: string;
  leadId: string;
  leadName: string;
  onApplyDraftToNote?: (text: string) => void;
}

export function AiDraftAssistant({
  workspaceId,
  leadId,
  leadName,
  onApplyDraftToNote,
}: AiDraftAssistantProps) {
  const [touchpoint, setTouchpoint] =
    React.useState<TouchpointType>("FIRST_TOUCH");
  const [tone, setTone] = React.useState<DraftTone>("FRIENDLY");
  const [useAi, setUseAi] = React.useState(false);

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [isAiGenerated, setIsAiGenerated] = React.useState(false);
  const [quotaRemaining, setQuotaRemaining] = React.useState<number | null>(
    null,
  );

  const [copiedSubject, setCopiedSubject] = React.useState(false);
  const [copiedBody, setCopiedBody] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load remaining quota on mount
  React.useEffect(() => {
    let mounted = true;
    async function loadQuota() {
      try {
        const res = await fetchDraftQuotaAction(workspaceId);
        if (mounted && res.success && res.data) {
          setQuotaRemaining(res.data.remaining);
        }
      } catch {
        // Fallback gracefully
      }
    }
    loadQuota();
    return () => {
      mounted = false;
    };
  }, [workspaceId]);

  async function handleGenerate(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setIsGenerating(true);
    setError(null);

    try {
      const res = await generateFollowUpDraftAction({
        workspaceId,
        leadId,
        touchpointType: touchpoint,
        tone,
        useAi,
      });

      if (res.success) {
        setSubject(res.data.subject);
        setBody(res.data.body);
        setIsAiGenerated(res.data.isAiGenerated);
        setQuotaRemaining(res.data.quotaRemaining);
      } else {
        setError(res.error || "Failed to generate follow-up draft.");
      }
    } catch {
      setError("An unexpected network error occurred while generating draft.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy(text: string, isSubj: boolean) {
    try {
      await navigator.clipboard.writeText(text);
      if (isSubj) {
        setCopiedSubject(true);
        setTimeout(() => setCopiedSubject(false), 2000);
      } else {
        setCopiedBody(true);
        setTimeout(() => setCopiedBody(false), 2000);
      }
    } catch {
      // Ignore clipboard write failures
    }
  }

  return (
    <Card className="border-purple-200 dark:border-purple-900/40 bg-purple-50/20 dark:bg-purple-950/10 shadow-xs">
      <CardHeader className="pb-3 border-b border-purple-100 dark:border-purple-900/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
              <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span>Follow-Up Message Assistant</span>
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Draft personalized outreach for {leadName} using deterministic
              templates or AI assistance.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {quotaRemaining !== null && (
              <Badge
                variant="outline"
                className="text-[11px] bg-white dark:bg-zinc-900"
              >
                {quotaRemaining} AI Drafts Left
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Configuration Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label
              htmlFor="touchpoint-select"
              className="text-xs text-zinc-600 dark:text-zinc-400"
            >
              Touchpoint Type
            </Label>
            <select
              id="touchpoint-select"
              value={touchpoint}
              onChange={(e) => setTouchpoint(e.target.value as TouchpointType)}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-600"
            >
              <option value="FIRST_TOUCH">First Touch (Outreach)</option>
              <option value="POST_DISCOVERY">Post-Discovery (Recap)</option>
              <option value="PROPOSAL_CHECK_IN">Proposal Check-In</option>
              <option value="RE_ENGAGEMENT">
                Re-Engagement (Cold/Stalled)
              </option>
            </select>
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="tone-select"
              className="text-xs text-zinc-600 dark:text-zinc-400"
            >
              Tone of Voice
            </Label>
            <select
              id="tone-select"
              value={tone}
              onChange={(e) => setTone(e.target.value as DraftTone)}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-600"
            >
              <option value="FRIENDLY">Friendly & Consultative</option>
              <option value="PROFESSIONAL">Professional & Formal</option>
              <option value="URGENT">Urgent & Deadline-Driven</option>
            </select>
          </div>

          <div className="flex flex-col justify-end space-y-1">
            <div className="flex items-center justify-between pb-1">
              <label
                htmlFor="use-ai-toggle"
                className="text-xs font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5 text-purple-600" />
                <span>Use AI Model</span>
              </label>
              <input
                id="use-ai-toggle"
                type="checkbox"
                checked={useAi}
                onChange={(e) => setUseAi(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
              />
            </div>
            <Button
              size="sm"
              onClick={() => handleGenerate()}
              disabled={isGenerating}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs gap-1.5 h-8"
            >
              {isGenerating ? (
                <>
                  <Spinner size="sm" />
                  <span>Drafting...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Generate Draft</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Output Draft Preview */}
        {subject && body && (
          <div className="space-y-3 pt-2 border-t border-purple-100 dark:border-purple-900/20 animate-in fade-in-50">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="draft-subject"
                  className="text-xs text-zinc-500"
                >
                  Subject Line
                </Label>
                <button
                  type="button"
                  onClick={() => handleCopy(subject, true)}
                  className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                >
                  {copiedSubject ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy Subject</span>
                    </>
                  )}
                </button>
              </div>
              <input
                id="draft-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="draft-body" className="text-xs text-zinc-500">
                  Message Body (Editable)
                </Label>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {isAiGenerated
                      ? "AI Generated"
                      : "Instant Template (<10ms)"}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => handleCopy(body, false)}
                    className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    {copiedBody ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-600" />
                        <span>Copied Body!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy Body</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <textarea
                id="draft-body"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-600 whitespace-pre-wrap"
              />
            </div>

            {onApplyDraftToNote && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onApplyDraftToNote(
                      `Draft Prepared:\nSubject: ${subject}\n\n${body}`,
                    )
                  }
                  className="text-xs gap-1.5"
                >
                  <Copy className="h-3 w-3" />
                  <span>Insert into Follow-Up Note</span>
                </Button>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 pt-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>
                Human-in-the-loop: Drafts require your manual review and are
                never dispatched without your action.
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
