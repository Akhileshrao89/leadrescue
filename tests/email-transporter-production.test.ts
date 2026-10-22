import { afterEach, describe, expect, it } from "vitest";
import { sendTransactionalEmail } from "@/features/reminders/email-transporter";

describe("email transport production safety", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalMode = process.env.EMAIL_TRANSPORT_MODE;
  const originalVitest = process.env.VITEST;

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV =
      originalNodeEnv;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalMode === undefined) delete process.env.EMAIL_TRANSPORT_MODE;
    else process.env.EMAIL_TRANSPORT_MODE = originalMode;
    if (originalVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = originalVitest;
  });

  it("does not report mock delivery as success in production", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.VITEST;
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_TRANSPORT_MODE = "mock";

    const result = await sendTransactionalEmail({
      to: "customer@example.com",
      subject: "Test",
      text: "Test message",
    });

    expect(result.success).toBe(false);
    expect(result.provider).toBe("unconfigured");
  });
});
