import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
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

  // Fail closed in production: a missing secret must never disable authentication.
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    return NextResponse.json(
      { error: "Cron endpoint is not configured" },
      { status: 503 },
    );
  }

  if (process.env.NODE_ENV === "production") {
    const expected = Buffer.from(`Bearer ${cronSecret}`, "utf8");
    const received = Buffer.from(authHeader || "", "utf8");
    const matches =
      expected.length === received.length &&
      timingSafeEqual(expected, received);

    if (!matches) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
