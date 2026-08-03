import { fetchJsonWithTimeout } from "./fetch-utils.ts";
import type { Fetcher, TurnstileVerifier } from "./types.ts";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MILLISECONDS = 3_000;

interface TurnstileVerifierOptions {
  secretKey: string;
  allowedHostnames: ReadonlySet<string>;
  fetcher?: Fetcher;
  timeoutMilliseconds?: number;
}

export function createTurnstileVerifier(
  options: TurnstileVerifierOptions,
): TurnstileVerifier {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMilliseconds = options.timeoutMilliseconds ??
    TURNSTILE_TIMEOUT_MILLISECONDS;

  return {
    async verify(
      input,
    ): Promise<"valid" | "invalid" | "unavailable" | "configuration_failure"> {
      const body: Record<string, string> = {
        secret: options.secretKey,
        response: input.token,
      };
      if (input.clientAddress) {
        body.remoteip = input.clientAddress;
      }

      try {
        const { response, payload } = await fetchJsonWithTimeout(
          fetcher,
          TURNSTILE_VERIFY_URL,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "AETHERA-Enquiry/1.0",
            },
            body: JSON.stringify(body),
          },
          timeoutMilliseconds,
        );
        if (!response.ok) {
          return "unavailable";
        }

        if (
          typeof payload !== "object" || payload === null ||
          !("success" in payload) ||
          typeof (payload as { success: unknown }).success !== "boolean"
        ) {
          return "unavailable";
        }
        if (!(payload as { success: boolean }).success) {
          const errorCodes = (payload as { "error-codes"?: unknown })["error-codes"];
          if (
            !Array.isArray(errorCodes) ||
            !errorCodes.every((code) => typeof code === "string")
          ) {
            return "unavailable";
          }
          if (
            errorCodes.includes("missing-input-secret") ||
            errorCodes.includes("invalid-input-secret")
          ) {
            return "configuration_failure";
          }
          if (errorCodes.includes("internal-error")) {
            return "unavailable";
          }
          return "invalid";
        }

        const hostname = (payload as { hostname?: unknown }).hostname;
        const action = (payload as { action?: unknown }).action;
        if (
          typeof hostname !== "string" || typeof action !== "string" ||
          !options.allowedHostnames.has(hostname.toLowerCase()) ||
          action !== "enquiry"
        ) {
          return "invalid";
        }
        return "valid";
      } catch {
        return "unavailable";
      }
    },
  };
}
