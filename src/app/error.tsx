"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { captureException } from "@/lib/observability/telemetry";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const incidentId = error.digest || "ERR_SYSTEM";

  React.useEffect(() => {
    // Log safe error telemetry without exposing internal server stack details
    try {
      captureException(error, {
        tags: { boundary: "GlobalError", digest: error.digest || "none" },
      });
    } catch {
      // Fallback if telemetry throws
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400 mb-6">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-zinc-500 max-w-sm">
        An unexpected error occurred. Our automated telemetry has logged the
        incident for investigation.
      </p>

      {incidentId && (
        <div className="mt-4 rounded bg-zinc-100 dark:bg-zinc-900 px-3 py-1.5 text-xs font-mono text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
          Incident ID: <span className="font-semibold">{incidentId}</span>
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={() => reset()} size="sm" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          <span>Try Again</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            router.push("/dashboard");
          }}
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
