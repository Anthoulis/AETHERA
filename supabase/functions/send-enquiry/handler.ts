import {
  createErrorResponse,
  createJsonResponse,
  createPreflightResponse,
  declaredBodyIsTooLarge,
  getAllowedOrigin,
  getClientAddress,
  hasJsonContentType,
  hasSupportedContentEncoding,
  readJsonBody,
} from "./http.ts";
import type { Enquiry, HandlerDependencies } from "./types.ts";
import { validateSubmission } from "./validation.ts";

const MINIMUM_COMPLETION_TIME_MILLISECONDS = 3_000;
const MAXIMUM_SUBMISSION_CLOCK_SKEW_MILLISECONDS = 24 * 60 * 60 * 1000;

function toEnquiry(submission: ReturnType<typeof validateSubmission> & { ok: true }): Enquiry {
  const value = submission.value;
  return {
    company: value.company,
    country: value.country,
    contactPerson: value.contactPerson,
    email: value.email,
    businessType: value.businessType,
    productInterest: value.productInterest,
    annualVolume: value.annualVolume,
    requirements: value.requirements,
  };
}

export function createHandler(
  dependencies: HandlerDependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const requestId = dependencies.randomUUID();
    const origin = getAllowedOrigin(request, dependencies.config.allowedOrigins);

    try {
      if (request.method === "OPTIONS") {
        if (!origin) {
          return createErrorResponse(
            403,
            "SECURITY_CHECK_FAILED",
            requestId,
            null,
          );
        }
        return createPreflightResponse(origin);
      }

      if (request.method !== "POST") {
        return createErrorResponse(
          405,
          "METHOD_NOT_ALLOWED",
          requestId,
          origin,
          { headers: { "Allow": "POST, OPTIONS" } },
        );
      }

      if (!origin) {
        return createErrorResponse(
          403,
          "SECURITY_CHECK_FAILED",
          requestId,
          null,
        );
      }

      if (!hasJsonContentType(request) || !hasSupportedContentEncoding(request)) {
        return createErrorResponse(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          requestId,
          origin,
        );
      }

      if (declaredBodyIsTooLarge(request)) {
        return createErrorResponse(
          413,
          "PAYLOAD_TOO_LARGE",
          requestId,
          origin,
        );
      }

      const nowMs = dependencies.now();
      const clientAddress = getClientAddress(request);
      let rateLimit;
      try {
        rateLimit = await dependencies.rateLimiter.check(clientAddress, nowMs);
      } catch {
        dependencies.logger.error("rate_limit_unavailable", requestId);
        return createErrorResponse(
          502,
          "TEMPORARILY_UNAVAILABLE",
          requestId,
          origin,
        );
      }
      if (rateLimit.status === "unavailable") {
        dependencies.logger.error("rate_limit_unavailable", requestId);
        return createErrorResponse(
          502,
          "TEMPORARILY_UNAVAILABLE",
          requestId,
          origin,
        );
      }
      if (rateLimit.status === "limited") {
        return createErrorResponse(
          429,
          "RATE_LIMITED",
          requestId,
          origin,
          { headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
        );
      }

      const body = await readJsonBody(request);
      if (!body.ok) {
        if (body.reason === "timeout") {
          return createErrorResponse(
            408,
            "INVALID_REQUEST",
            requestId,
            origin,
          );
        }
        return createErrorResponse(
          body.reason === "too_large" ? 413 : 400,
          body.reason === "too_large" ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST",
          requestId,
          origin,
        );
      }

      const validation = validateSubmission(body.value);
      if (!validation.ok) {
        if (validation.securityFailure) {
          return createErrorResponse(
            403,
            "SECURITY_CHECK_FAILED",
            requestId,
            origin,
          );
        }
        return createErrorResponse(
          400,
          "INVALID_REQUEST",
          requestId,
          origin,
          { fieldErrors: validation.fieldErrors },
        );
      }

      const elapsedMilliseconds = validation.value.submittedAtMs -
        validation.value.formStartedAt;
      if (
        elapsedMilliseconds < MINIMUM_COMPLETION_TIME_MILLISECONDS ||
        Math.abs(nowMs - validation.value.submittedAtMs) >
          MAXIMUM_SUBMISSION_CLOCK_SKEW_MILLISECONDS
      ) {
        return createErrorResponse(
          403,
          "SECURITY_CHECK_FAILED",
          requestId,
          origin,
        );
      }

      let turnstileResult;
      try {
        turnstileResult = await dependencies.turnstileVerifier.verify({
          token: validation.value.turnstileToken,
          clientAddress,
        });
      } catch {
        dependencies.logger.error("turnstile_unavailable", requestId);
        return createErrorResponse(
          502,
          "TEMPORARILY_UNAVAILABLE",
          requestId,
          origin,
        );
      }
      if (turnstileResult === "invalid") {
        return createErrorResponse(
          403,
          "SECURITY_CHECK_FAILED",
          requestId,
          origin,
        );
      }
      if (turnstileResult === "unavailable") {
        dependencies.logger.error("turnstile_unavailable", requestId);
        return createErrorResponse(
          502,
          "TEMPORARILY_UNAVAILABLE",
          requestId,
          origin,
        );
      }
      if (turnstileResult === "configuration_failure") {
        dependencies.logger.error("turnstile_configuration_error", requestId);
        return createErrorResponse(
          500,
          "INTERNAL_ERROR",
          requestId,
          origin,
        );
      }

      let emailResult;
      try {
        emailResult = await dependencies.emailService.send(
          toEnquiry(validation),
          {
            submissionId: validation.value.submissionId,
            submittedAt: validation.value.submittedAt,
          },
        );
      } catch {
        dependencies.logger.error("email_provider_unavailable", requestId);
        return createErrorResponse(
          502,
          "TEMPORARILY_UNAVAILABLE",
          requestId,
          origin,
        );
      }
      if (emailResult === "temporary_failure") {
        dependencies.logger.error("email_provider_unavailable", requestId);
        return createErrorResponse(
          502,
          "TEMPORARILY_UNAVAILABLE",
          requestId,
          origin,
        );
      }
      if (emailResult === "configuration_failure") {
        dependencies.logger.error("email_provider_configuration_error", requestId);
        return createErrorResponse(
          500,
          "INTERNAL_ERROR",
          requestId,
          origin,
        );
      }

      return createJsonResponse(
        { ok: true, code: "ENQUIRY_SENT", requestId },
        200,
        origin,
      );
    } catch {
      dependencies.logger.error("unhandled_request_error", requestId);
      return createErrorResponse(500, "INTERNAL_ERROR", requestId, origin);
    }
  };
}
