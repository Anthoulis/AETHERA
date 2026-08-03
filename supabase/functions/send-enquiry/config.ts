import type { AppConfig } from "./types.ts";

export type EnvironmentReader = (name: string) => string | undefined;

const SIMPLE_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;

function hasUnsafeHeaderCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (
      codePoint <= 31 || (codePoint >= 127 && codePoint <= 159) ||
      codePoint === 0x2028 || codePoint === 0x2029
    ) {
      return true;
    }
  }
  return false;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

function requireEnvironmentValue(
  readEnvironment: EnvironmentReader,
  name: string,
): string {
  const value = readEnvironment(name)?.trim();
  if (!value) {
    throw new ConfigurationError(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseAllowedOrigins(value: string): ReadonlySet<string> {
  const origins = value.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) {
    throw new ConfigurationError("ALLOWED_ORIGINS must contain at least one origin");
  }

  const parsed = new Set<string>();
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new ConfigurationError("ALLOWED_ORIGINS contains an invalid origin");
    }

    const isLoopback = url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    const usesAllowedProtocol = url.protocol === "https:" ||
      (isLoopback && url.protocol === "http:");
    if (url.origin !== origin || !usesAllowedProtocol) {
      throw new ConfigurationError(
        "ALLOWED_ORIGINS must contain exact HTTPS origins or explicit local development origins",
      );
    }
    parsed.add(url.origin);
  }

  return parsed;
}

function validateEmailSetting(value: string, name: string): string {
  if (
    value.length > 320 || hasUnsafeHeaderCharacters(value) ||
    !SIMPLE_EMAIL.test(value)
  ) {
    throw new ConfigurationError(`${name} must be a single valid email address`);
  }
  return value;
}

function validateFromSetting(value: string): string {
  if (value.length > 320 || hasUnsafeHeaderCharacters(value)) {
    throw new ConfigurationError("ENQUIRY_FROM_EMAIL is invalid");
  }

  const friendlyMatch = value.match(/^([^<>]*)<([^<>]+)>$/u);
  const address = friendlyMatch ? friendlyMatch[2]!.trim() : value;
  if (!SIMPLE_EMAIL.test(address)) {
    throw new ConfigurationError("ENQUIRY_FROM_EMAIL is invalid");
  }
  return value;
}

function validateUpstashUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError("UPSTASH_REDIS_REST_URL is invalid");
  }

  if (url.protocol !== "https:" || url.pathname !== "/") {
    throw new ConfigurationError(
      "UPSTASH_REDIS_REST_URL must be an HTTPS URL without query parameters",
    );
  }
  if (url.search || url.hash || url.username || url.password) {
    throw new ConfigurationError(
      "UPSTASH_REDIS_REST_URL must not contain credentials or query parameters",
    );
  }
  return value.replace(/\/$/u, "");
}

export function readConfig(readEnvironment: EnvironmentReader): AppConfig {
  const allowedOrigins = parseAllowedOrigins(
    requireEnvironmentValue(readEnvironment, "ALLOWED_ORIGINS"),
  );
  const allowedTurnstileHostnames = new Set(
    [...allowedOrigins].map((origin) => new URL(origin).hostname.toLowerCase()),
  );
  const rateLimitIpSalt = requireEnvironmentValue(
    readEnvironment,
    "RATE_LIMIT_IP_SALT",
  );
  if (rateLimitIpSalt.length < 32) {
    throw new ConfigurationError("RATE_LIMIT_IP_SALT must contain at least 32 characters");
  }

  return {
    allowedOrigins,
    allowedTurnstileHostnames,
    resendApiKey: requireEnvironmentValue(readEnvironment, "RESEND_API_KEY"),
    enquiryRecipientEmail: validateEmailSetting(
      requireEnvironmentValue(readEnvironment, "ENQUIRY_RECIPIENT_EMAIL"),
      "ENQUIRY_RECIPIENT_EMAIL",
    ),
    enquiryFromEmail: validateFromSetting(
      requireEnvironmentValue(readEnvironment, "ENQUIRY_FROM_EMAIL"),
    ),
    turnstileSecretKey: requireEnvironmentValue(
      readEnvironment,
      "TURNSTILE_SECRET_KEY",
    ),
    upstashRedisRestUrl: validateUpstashUrl(
      requireEnvironmentValue(readEnvironment, "UPSTASH_REDIS_REST_URL"),
    ),
    upstashRedisRestToken: requireEnvironmentValue(
      readEnvironment,
      "UPSTASH_REDIS_REST_TOKEN",
    ),
    rateLimitIpSalt,
  };
}
