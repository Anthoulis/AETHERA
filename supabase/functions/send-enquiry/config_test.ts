import { ConfigurationError, readConfig } from "./config.ts";
import { assert, assertEquals } from "./test-utils.ts";

const validEnvironment: Record<string, string> = {
  RESEND_API_KEY: "re_test_key",
  ENQUIRY_RECIPIENT_EMAIL: "hello@aethera.gr",
  ENQUIRY_FROM_EMAIL: "AETHERA <enquiries@aethera.gr>",
  TURNSTILE_SECRET_KEY: "turnstile-secret",
  ALLOWED_ORIGINS: "https://www.aethera.gr,http://localhost:8000",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "upstash-token",
  RATE_LIMIT_IP_SALT: "0123456789abcdef0123456789abcdef",
};

function createReader(values: Record<string, string>): (name: string) => string | undefined {
  return (name) => values[name];
}

function assertConfigurationError(values: Record<string, string>): void {
  let thrown: unknown;
  try {
    readConfig(createReader(values));
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof ConfigurationError);
}

Deno.test("configuration loads exact origins and derives Turnstile hostnames", () => {
  const config = readConfig(createReader(validEnvironment));
  assertEquals([...config.allowedOrigins], [
    "https://www.aethera.gr",
    "http://localhost:8000",
  ]);
  assertEquals([...config.allowedTurnstileHostnames], [
    "www.aethera.gr",
    "localhost",
  ]);
  assertEquals(config.enquiryFromEmail, "AETHERA <enquiries@aethera.gr>");
});

Deno.test("configuration fails fast when a required secret is absent", () => {
  const values = { ...validEnvironment };
  delete values.RESEND_API_KEY;
  assertConfigurationError(values);
});

Deno.test("configuration rejects permissive or path-bearing provider URLs", () => {
  assertConfigurationError({
    ...validEnvironment,
    ALLOWED_ORIGINS: "*",
  });
  assertConfigurationError({
    ...validEnvironment,
    ALLOWED_ORIGINS: "https://www.aethera.gr/",
  });
  assertConfigurationError({
    ...validEnvironment,
    ALLOWED_ORIGINS: "ftp://localhost",
  });
  assertConfigurationError({
    ...validEnvironment,
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io/path",
  });
});

Deno.test("configuration rejects weak salts and unsafe email settings", () => {
  assertConfigurationError({
    ...validEnvironment,
    RATE_LIMIT_IP_SALT: "too-short",
  });
  assertConfigurationError({
    ...validEnvironment,
    ENQUIRY_RECIPIENT_EMAIL: "hello@aethera.gr\r\nBcc: attacker@example.com",
  });
  assertConfigurationError({
    ...validEnvironment,
    ENQUIRY_FROM_EMAIL: "AETHERA\u0085<enquiries@aethera.gr>",
  });
});
