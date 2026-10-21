import { NextRequest, NextResponse } from "next/server";
import { runOutboxWorkerTick } from "@/features/reminders/runner";

export async function GET(request: NextRequest) {
  return handleCronWorker(request);
}

export async function POST(request: NextRequest) {
  return handleCronWorker(request);
}

async function handleCronWorker(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");

  // In production, if CRON_SECRET is configured, strictly enforce bearer authentication
  if (
    process.env.NODE_ENV === "production" &&
    cronSecret &&
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing cron secret" },
      { status: 401 },
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const batchSize = Math.min(
    Math.max(1, parseInt(searchParams.get("batch") || "10", 10)),
    100,
  );

  try {
    const result = await runOutboxWorkerTick({ batchSize });
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal worker error",
      },
      { status: 500 },
    );
  }
}
