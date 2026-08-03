import { readConfig } from "./config.ts";
import { createResendEmailService } from "./email-service.ts";
import { createHandler } from "./handler.ts";
import { createErrorResponse } from "./http.ts";
import { createUpstashRateLimiter } from "./rate-limit.ts";
import { createTurnstileVerifier } from "./turnstile.ts";
import type { SafeLogger } from "./types.ts";

const logger: SafeLogger = {
  error(event, requestId) {
    console.error(JSON.stringify({ event, requestId }));
  },
};

function createRuntimeHandler(): (request: Request) => Promise<Response> {
  const config = readConfig((name) => Deno.env.get(name));
  return createHandler({
    config,
    rateLimiter: createUpstashRateLimiter({
      restUrl: config.upstashRedisRestUrl,
      restToken: config.upstashRedisRestToken,
      ipSalt: config.rateLimitIpSalt,
    }),
    turnstileVerifier: createTurnstileVerifier({
      secretKey: config.turnstileSecretKey,
      allowedHostnames: config.allowedTurnstileHostnames,
    }),
    emailService: createResendEmailService({
      apiKey: config.resendApiKey,
      recipientEmail: config.enquiryRecipientEmail,
      fromEmail: config.enquiryFromEmail,
    }),
    now: Date.now,
    randomUUID: () => crypto.randomUUID(),
    logger,
  });
}

let runtimeHandler: (request: Request) => Promise<Response>;
try {
  runtimeHandler = createRuntimeHandler();
} catch {
  console.error(JSON.stringify({ event: "configuration_invalid" }));
  runtimeHandler = () =>
    Promise.resolve(createErrorResponse(
      500,
      "INTERNAL_ERROR",
      crypto.randomUUID(),
      null,
    ));
}

Deno.serve(runtimeHandler);
