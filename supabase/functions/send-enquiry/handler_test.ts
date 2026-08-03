import { createHandler } from "./handler.ts";
import { getClientAddress, MAX_REQUEST_BODY_BYTES, readJsonBody } from "./http.ts";
import { assert, assertEquals, readJson } from "./test-utils.ts";
import type {
  EmailService,
  Enquiry,
  HandlerDependencies,
  RateLimitResult,
  TurnstileVerifier,
} from "./types.ts";

const ORIGIN = "https://www.aethera.gr";
const NOW = Date.parse("2026-08-03T12:00:00.000Z");

const validBody = {
  company: "Aegean Foods",
  country: "Greece",
  contactPerson: "Alex Example",
  email: "alex@example.com",
  businessType: "food-importer",
  productInterest: "retail-and-bulk",
  annualVolume: "2 tonnes",
  requirements: "English labels",
  website: "",
  turnstileToken: "valid-token",
  formStartedAt: NOW - 5_000,
  submittedAt: new Date(NOW).toISOString(),
  submissionId: "123e4567-e89b-42d3-a456-426614174000",
};

interface HandlerState {
  rateLimitCalls: number;
  turnstileCalls: number;
  emailCalls: number;
  sentEnquiry: Enquiry | null;
  loggedEvents: string[];
}

interface HandlerOverrides {
  rateLimit?: RateLimitResult;
  turnstile?: "valid" | "invalid" | "unavailable" | "configuration_failure";
  email?: "sent" | "temporary_failure" | "configuration_failure";
  throwFrom?: "rateLimit" | "turnstile" | "email";
}

function createTestHandler(overrides: HandlerOverrides = {}): {
  handler: (request: Request) => Promise<Response>;
  state: HandlerState;
} {
  const state: HandlerState = {
    rateLimitCalls: 0,
    turnstileCalls: 0,
    emailCalls: 0,
    sentEnquiry: null,
    loggedEvents: [],
  };
  const rateLimiter = {
    check: (): Promise<RateLimitResult> => {
      state.rateLimitCalls += 1;
      if (overrides.throwFrom === "rateLimit") {
        return Promise.reject(new Error("provider detail must not escape"));
      }
      return Promise.resolve(overrides.rateLimit ?? { status: "allowed" });
    },
  };
  const turnstileVerifier: TurnstileVerifier = {
    verify: () => {
      state.turnstileCalls += 1;
      if (overrides.throwFrom === "turnstile") {
        return Promise.reject(new Error("provider detail must not escape"));
      }
      return Promise.resolve(overrides.turnstile ?? "valid");
    },
  };
  const emailService: EmailService = {
    send: (enquiry) => {
      state.emailCalls += 1;
      state.sentEnquiry = enquiry;
      if (overrides.throwFrom === "email") {
        return Promise.reject(new Error("provider detail must not escape"));
      }
      return Promise.resolve(overrides.email ?? "sent");
    },
  };
  const dependencies: HandlerDependencies = {
    config: { allowedOrigins: new Set([ORIGIN, "http://localhost:8000"]) },
    rateLimiter,
    turnstileVerifier,
    emailService,
    now: () => NOW,
    randomUUID: () => "request-id",
    logger: {
      error(event) {
        state.loggedEvents.push(event);
      },
    },
  };
  return { handler: createHandler(dependencies), state };
}

function createRequest(options: {
  body?: unknown;
  rawBody?: string;
  method?: string;
  origin?: string | null;
  contentType?: string;
  headers?: HeadersInit;
} = {}): Request {
  const method = options.method ?? "POST";
  const headers = new Headers(options.headers);
  if (options.origin !== null) {
    headers.set("Origin", options.origin ?? ORIGIN);
  }
  if (options.contentType !== "") {
    headers.set("Content-Type", options.contentType ?? "application/json");
  }
  const canHaveBody = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  const body = canHaveBody
    ? options.rawBody ?? JSON.stringify(options.body ?? validBody)
    : undefined;
  return new Request("https://project.supabase.co/functions/v1/send-enquiry", {
    method,
    headers,
    body,
  });
}

Deno.test("handler sends exactly one email for a valid request", async () => {
  const { handler, state } = createTestHandler();
  const response = await handler(createRequest({
    headers: { "X-Forwarded-For": "203.0.113.10, 10.0.0.1" },
  }));
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body, { ok: true, code: "ENQUIRY_SENT", requestId: "request-id" });
  assertEquals(response.headers.get("access-control-allow-origin"), ORIGIN);
  assertEquals(state.rateLimitCalls, 1);
  assertEquals(state.turnstileCalls, 1);
  assertEquals(state.emailCalls, 1);
  assert(state.sentEnquiry !== null);
  assertEquals("turnstileToken" in state.sentEnquiry, false);
});

Deno.test("handler supports allowed CORS preflight without provider calls", async () => {
  const { handler, state } = createTestHandler();
  const response = await handler(createRequest({ method: "OPTIONS" }));

  assertEquals(response.status, 204);
  assertEquals(response.headers.get("access-control-allow-origin"), ORIGIN);
  assertEquals(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assertEquals(state.rateLimitCalls, 0);
});

Deno.test("handler rejects unsupported methods, media types, and origins", async () => {
  const { handler } = createTestHandler();

  const method = await handler(createRequest({ method: "GET" }));
  assertEquals(method.status, 405);
  assertEquals(method.headers.get("allow"), "POST, OPTIONS");

  const mediaType = await handler(createRequest({ contentType: "text/plain" }));
  assertEquals(mediaType.status, 415);
  assertEquals((await readJson(mediaType)).code, "UNSUPPORTED_MEDIA_TYPE");

  const encoded = await handler(createRequest({
    headers: { "Content-Encoding": "gzip" },
  }));
  assertEquals(encoded.status, 415);

  const origin = await handler(createRequest({ origin: "https://attacker.invalid" }));
  assertEquals(origin.status, 403);
  assertEquals(origin.headers.get("access-control-allow-origin"), null);
});

Deno.test("body reader rejects invalid UTF-8 and slow streams", async () => {
  const invalidUtf8 = new Request("https://example.invalid", {
    method: "POST",
    body: new Uint8Array([0xFF]),
  });
  assertEquals(await readJsonBody(invalidUtf8), {
    ok: false,
    reason: "invalid_json",
  });

  const slowStream = new ReadableStream<Uint8Array>({ start() {} });
  const slowRequest = new Request("https://example.invalid", {
    method: "POST",
    body: slowStream,
  });
  assertEquals(await readJsonBody(slowRequest, 1), {
    ok: false,
    reason: "timeout",
  });
});

Deno.test("client IP parsing canonicalizes valid addresses and rejects ambiguous ones", () => {
  const withAddress = (address: string) =>
    new Request("https://example.invalid", {
      headers: { "X-Forwarded-For": address },
    });

  assertEquals(getClientAddress(withAddress("203.000.113.010")), "203.0.113.10");
  assertEquals(getClientAddress(withAddress("999.1.1.1")), null);
  assertEquals(getClientAddress(withAddress("203.0.113.10:1234")), null);
  assertEquals(
    getClientAddress(withAddress("2001:0db8:0:0:0:0:0:1")),
    getClientAddress(withAddress("2001:db8::1")),
  );
});

Deno.test("handler rejects malformed JSON and streamed oversized bodies", async () => {
  const { handler } = createTestHandler();
  const malformed = await handler(createRequest({ rawBody: "{" }));
  assertEquals(malformed.status, 400);
  assertEquals((await readJson(malformed)).code, "INVALID_REQUEST");

  const oversized = await handler(createRequest({
    rawBody: JSON.stringify({ payload: "x".repeat(MAX_REQUEST_BODY_BYTES) }),
  }));
  assertEquals(oversized.status, 413);
  assertEquals((await readJson(oversized)).code, "PAYLOAD_TOO_LARGE");
});

Deno.test("handler returns safe inline field error codes", async () => {
  const { handler } = createTestHandler();
  const invalid = { ...validBody } as Record<string, unknown>;
  delete invalid.company;
  invalid.email = "invalid";
  invalid.businessType = "invented";

  const response = await handler(createRequest({ body: invalid }));
  const body = await readJson(response);
  assertEquals(response.status, 400);
  assertEquals(body.code, "INVALID_REQUEST");
  assertEquals(body.fieldErrors, {
    company: "required",
    email: "invalidEmail",
    businessType: "invalidOption",
  });
});

Deno.test("handler rejects missing Turnstile, honeypot, and fast submissions", async () => {
  for (
    const body of [
      { ...validBody, turnstileToken: "" },
      { ...validBody, website: "bot value" },
      { ...validBody, formStartedAt: NOW - 500 },
    ]
  ) {
    const { handler, state } = createTestHandler();
    const response = await handler(createRequest({ body }));
    assertEquals(response.status, 403);
    assertEquals((await readJson(response)).code, "SECURITY_CHECK_FAILED");
    assertEquals(state.emailCalls, 0);
  }
});

Deno.test("handler maps distributed rate-limit outcomes", async () => {
  const limitedSetup = createTestHandler({
    rateLimit: { status: "limited", retryAfterSeconds: 42 },
  });
  const limited = await limitedSetup.handler(createRequest());
  assertEquals(limited.status, 429);
  assertEquals(limited.headers.get("retry-after"), "42");
  assertEquals(limited.headers.get("access-control-expose-headers"), "Retry-After");
  assertEquals(limitedSetup.state.turnstileCalls, 0);

  const unavailableSetup = createTestHandler({ rateLimit: { status: "unavailable" } });
  const unavailable = await unavailableSetup.handler(createRequest());
  assertEquals(unavailable.status, 502);
  assertEquals((await readJson(unavailable)).code, "TEMPORARILY_UNAVAILABLE");
  assertEquals(unavailableSetup.state.turnstileCalls, 0);

  const thrownSetup = createTestHandler({ throwFrom: "rateLimit" });
  const thrown = await thrownSetup.handler(createRequest());
  assertEquals(thrown.status, 502);
  assert(!JSON.stringify(await readJson(thrown)).includes("provider detail"));
});

Deno.test("handler maps Turnstile and Resend failures without internal detail", async () => {
  const invalidTurnstile = createTestHandler({ turnstile: "invalid" });
  assertEquals((await invalidTurnstile.handler(createRequest())).status, 403);
  assertEquals(invalidTurnstile.state.emailCalls, 0);

  const unavailableTurnstile = createTestHandler({ turnstile: "unavailable" });
  assertEquals((await unavailableTurnstile.handler(createRequest())).status, 502);
  assertEquals(unavailableTurnstile.state.emailCalls, 0);

  const turnstileConfiguration = createTestHandler({
    turnstile: "configuration_failure",
  });
  assertEquals((await turnstileConfiguration.handler(createRequest())).status, 500);
  assertEquals(turnstileConfiguration.state.emailCalls, 0);

  const temporaryEmail = createTestHandler({ email: "temporary_failure" });
  assertEquals((await temporaryEmail.handler(createRequest())).status, 502);

  const configurationEmail = createTestHandler({ email: "configuration_failure" });
  assertEquals((await configurationEmail.handler(createRequest())).status, 500);

  const thrownEmail = createTestHandler({ throwFrom: "email" });
  const thrownResponse = await thrownEmail.handler(createRequest());
  assertEquals(thrownResponse.status, 502);
  assert(!JSON.stringify(await readJson(thrownResponse)).includes("provider detail"));
});
