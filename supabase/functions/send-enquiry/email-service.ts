import { renderEnquiryEmail } from "./email-template.ts";
import { fetchJsonWithTimeout } from "./fetch-utils.ts";
import type { EmailService, Enquiry, Fetcher } from "./types.ts";

const RESEND_EMAIL_URL = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MILLISECONDS = 6_000;

interface ResendEmailServiceOptions {
  apiKey: string;
  recipientEmail: string;
  fromEmail: string;
  fetcher?: Fetcher;
  timeoutMilliseconds?: number;
}

function classifyProviderFailure(status: number): "temporary_failure" | "configuration_failure" {
  if (status === 408 || status === 409 || status === 429 || status >= 500) {
    return "temporary_failure";
  }
  return "configuration_failure";
}

export function createResendEmailService(
  options: ResendEmailServiceOptions,
): EmailService {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMilliseconds = options.timeoutMilliseconds ??
    RESEND_TIMEOUT_MILLISECONDS;

  return {
    async send(
      enquiry: Enquiry,
      context: { submissionId: string; submittedAt: string },
    ): Promise<"sent" | "temporary_failure" | "configuration_failure"> {
      const rendered = renderEnquiryEmail(enquiry, context.submittedAt);
      const requestBody = JSON.stringify({
        from: options.fromEmail,
        to: [options.recipientEmail],
        reply_to: enquiry.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
      const idempotencyKey = `aethera-enquiry/${context.submissionId}`;

      try {
        const { response, payload } = await fetchJsonWithTimeout(
          fetcher,
          RESEND_EMAIL_URL,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${options.apiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": idempotencyKey,
              "User-Agent": "AETHERA-Enquiry/1.0",
            },
            body: requestBody,
          },
          timeoutMilliseconds,
        );
        if (!response.ok) {
          return classifyProviderFailure(response.status);
        }

        if (
          typeof payload !== "object" || payload === null ||
          typeof (payload as { id?: unknown }).id !== "string" ||
          (payload as { id: string }).id.length === 0
        ) {
          return "temporary_failure";
        }
        return "sent";
      } catch {
        return "temporary_failure";
      }
    },
  };
}
