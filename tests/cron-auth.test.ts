import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/features/reminders/runner", () => ({
  runOutboxWorkerTick: vi.fn().mockResolvedValue({ processed: 0 }),
}));

import { GET } from "@/app/api/cron/outbox/route";

describe("outbox cron endpoint authentication", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCronSecret = process.env.CRON_SECRET;

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV =
      originalNodeEnv;
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  it("fails closed when production has no CRON_SECRET", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.CRON_SECRET;

    const response = await GET(
      new NextRequest("https://example.test/api/cron/outbox"),
    );

    expect(response.status).toBe(503);
  });

  it("rejects requests with an invalid production bearer token", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.CRON_SECRET = "test-only-secret";

    const response = await GET(
      new NextRequest("https://example.test/api/cron/outbox", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
  });
});
