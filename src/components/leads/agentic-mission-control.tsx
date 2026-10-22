"use client";

import * as React from "react";
import { Lead } from "@/features/leads/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Zap,
  ShieldAlert,
  CheckCircle,
  Copy,
  Clock,
  Compass,
  AlertTriangle,
  Send,
} from "lucide-react";
import {
  runAgentEvaluationAction,
  executeAgentPlanAction,
} from "@/features/ai-agent/actions";
import { AgentRunResult } from "@/features/ai-agent/types";

interface AgenticMissionControlProps {
  lead: Lead;
  onPlanExecuted?: () => void;
}

export function AgenticMissionControl({
  lead,
  onPlanExecuted,
}: AgenticMissionControlProps) {
  const [isRunning, setIsRunning] = React.useState(false);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [result, setResult] = React.useState<AgentRunResult | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [executionMessage, setExecutionMessage] = React.useState<string | null>(
    null,
  );

  // Auto-run agent evaluation on mount or lead change
  React.useEffect(() => {
    let mounted = true;
    async function evaluate() {
      setIsRunning(true);
      const res = await runAgentEvaluationAction({
        leadId: lead.id,
        leadOverride: lead,
      });
      if (mounted && res.success && res.data) {
        setResult(res.data);
      }
      if (mounted) setIsRunning(false);
    }
    evaluate();
    return () => {
      mounted = false;
    };
  }, [lead]);

  const handleCopyMessage = () => {
    if (!result?.plan?.personalizedBody) return;
    navigator.clipboard.writeText(
      `Subject: ${result.plan.suggestedSubject}\n\n${result.plan.personalizedBody}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExecutePlan = async () => {
    if (!result?.plan) return;
    setIsExecuting(true);
    setExecutionMessage(null);

    const res = await executeAgentPlanAction({
      leadId: lead.id,
      plan: result.plan,
      leadName: `${lead.firstName} ${lead.lastName || ""}`.trim(),
      leadEmail: lead.email || undefined,
      companyName: lead.companyName || undefined,
    });

    setIsExecuting(false);
    if (res.success) {
      setExecutionMessage(
        `Plan executed! Stage transitioned to ${result.plan.recommendedStage} & follow-up reminder queued for T+${result.plan.followUpOffsetDays} days.`,
      );
      if (onPlanExecuted) {
        onPlanExecuted();
      }
    } else {
      setExecutionMessage(res.error || "Failed to execute agent plan.");
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "LOW":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300";
      case "MEDIUM":
        return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300";
      case "HIGH":
      case "CRITICAL":
        return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300";
      default:
        return "bg-zinc-100 text-zinc-800";
    }
  };

  return (
    <Card className="border-indigo-200 dark:border-indigo-900/60 shadow-md bg-gradient-to-b from-indigo-50/40 to-white dark:from-indigo-950/20 dark:to-zinc-900">
      <CardHeader className="pb-3 border-b border-indigo-100 dark:border-indigo-950">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <span>Lead Risk & Follow-up Assistant</span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time conversion psychology, churn diagnosis, and action
                orchestration
              </CardDescription>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              setIsRunning(true);
              const res = await runAgentEvaluationAction({
                leadId: lead.id,
                leadOverride: lead,
              });
              if (res.success && res.data) setResult(res.data);
              setIsRunning(false);
            }}
            disabled={isRunning}
            className="text-xs h-7 gap-1"
          >
            <Zap
              className={`h-3.5 w-3.5 text-indigo-500 ${isRunning ? "animate-spin" : ""}`}
            />
            <span>{isRunning ? "Diagnosing..." : "Re-evaluate"}</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {result && (
          <>
            {/* Risk & Opportunity Matrix */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 bg-white dark:bg-zinc-900/90 shadow-2xs">
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Deal Churn Risk</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex px-2 py-0.5 text-xs font-bold rounded-md border ${getRiskColor(
                      result.assessment.churnRisk,
                    )}`}
                  >
                    {result.assessment.churnRisk} (
                    {result.assessment.churnRiskScore}%)
                  </span>
                </div>
              </div>

              <div className="rounded-lg border p-3 bg-white dark:bg-zinc-900/90 shadow-2xs">
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Detected Friction</span>
                </div>
                <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                  {result.assessment.detectedObjection.replace(/_/g, " ")}
                </div>
              </div>

              <div className="rounded-lg border p-3 bg-white dark:bg-zinc-900/90 shadow-2xs">
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Compass className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Strategic Tactic</span>
                </div>
                <div className="font-semibold text-xs text-indigo-600 dark:text-indigo-400 truncate">
                  {result.assessment.recommendedTactic}
                </div>
              </div>
            </div>

            {/* Agent Chain of Thought / Reasoning Trace */}
            <div className="rounded-lg bg-zinc-900 text-zinc-200 p-3 text-xs space-y-1.5 border border-zinc-800 font-mono">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-indigo-400" />
                <span>Agent Reasoning Trace (OODA Decision Loop)</span>
              </div>
              {result.plan.reasoningTrace.map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-1.5 leading-relaxed text-zinc-300"
                >
                  <span className="text-indigo-400 font-bold select-none">
                    &gt;
                  </span>
                  <span>{step}</span>
                </div>
              ))}
            </div>

            {/* Synthesized Outreach Plan & Personalized Copy */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Recommended Follow-Up Message
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    Tone: {result.plan.recommendedTone}
                  </Badge>
                  <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Send in {result.plan.followUpOffsetDays}d</span>
                  </span>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyMessage}
                  className="h-7 text-xs gap-1 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
                >
                  {copied ? (
                    <>
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Message</span>
                    </>
                  )}
                </Button>
              </div>

              <div className="p-2.5 rounded bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 space-y-1.5">
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Subject: {result.plan.suggestedSubject}
                </div>
                <div className="whitespace-pre-line text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  {result.plan.personalizedBody}
                </div>
              </div>
            </div>

            {/* Execution Confirmation Alert */}
            {executionMessage && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/80 p-2.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{executionMessage}</span>
              </div>
            )}
          </>
        )}
      </CardContent>

      <CardFooter className="pt-0 flex items-center justify-between border-t border-indigo-50 dark:border-indigo-950/40 p-4">
        <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
          <span>Heuristic score (not calibrated):</span>
          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
            {result ? `${result.confidenceScore}%` : "—"}
          </span>
          <span>• One-click execution of a rule-based recommendation</span>
        </div>

        <Button
          onClick={handleExecutePlan}
          disabled={isExecuting || !result?.plan}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5 shadow-xs"
        >
          <Send className="h-3.5 w-3.5" />
          <span>
            {isExecuting
              ? "Executing Plan..."
              : "Execute Agent Plan in 1-Click"}
          </span>
        </Button>
      </CardFooter>
    </Card>
  );
}
