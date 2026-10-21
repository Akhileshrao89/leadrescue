export interface EmailMessage {
  to: string;
  from?: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailDispatchResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: "resend" | "mock";
}

// In-memory log for test assertions and local verification
const mockDispatchLog: Array<
  EmailMessage & { timestamp: string; messageId: string }
> = [];

export function getMockEmailTransporterLog() {
  return [...mockDispatchLog];
}

export function clearMockEmailTransporterLog() {
  mockDispatchLog.length = 0;
}

/**
 * Dispatches a transactional email using Resend if RESEND_API_KEY is configured.
 * In development, test environments, or when unconfigured, gracefully falls back
 * to the mock transporter with zero external network dependencies.
 */
export async function sendTransactionalEmail(
  message: EmailMessage,
): Promise<EmailDispatchResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const defaultFrom =
    process.env.EMAIL_FROM?.trim() ||
    "LeadRescue Notifications <notifications@leadrescue.example.com>";
  const fromAddress = message.from || defaultFrom;

  // Use live Resend API only when a genuine API key is present and not running in test runner
  const isGenuineResendKey = Boolean(
    apiKey && apiKey.startsWith("re_") && !apiKey.includes("123456789"),
  );
  const isTestEnvironment =
    process.env.NODE_ENV === "test" || process.env.VITEST === "true";

  if (isGenuineResendKey && !isTestEnvironment) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Resend HTTP ${response.status}: ${errorText}`,
          provider: "resend",
        };
      }

      const data = (await response.json()) as { id?: string };
      return {
        success: true,
        messageId: data.id || `re_${Date.now()}`,
        provider: "resend",
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown network error",
        provider: "resend",
      };
    }
  }

  // Mock / Fallback delivery
  const generatedId = `mock_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  mockDispatchLog.push({
    ...message,
    from: fromAddress,
    timestamp: new Date().toISOString(),
    messageId: generatedId,
  });

  return {
    success: true,
    messageId: generatedId,
    provider: "mock",
  };
}
