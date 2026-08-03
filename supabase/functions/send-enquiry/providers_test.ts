import { createResendEmailService } from "./email-service.ts";
import { createUpstashRateLimiter, RATE_LIMIT_SCRIPT } from "./rate-limit.ts";
import { assert, assertEquals } from "./test-utils.ts";
import { createTurnstileVerifier } from "./turnstile.ts";
import type { Enquiry, Fetcher } from "./types.ts";

const enquiry: Enquiry = {
  company: "Aegean <Foods>",
  country: "Greece",
  contactPerson: "Alex Example",
  email: "alex@example.com",
  businessType: "food-importer",
  productInterest: "retail-and-bulk",
  annualVolume: "2 tonnes",
  requirements: "Need <script>alert('x')</script> labels",
};

const emailContext = {
  submissionId: "123e4567-e89b-42d3-a456-426614174000",
  submittedAt: "2026-08-03T12:00:00.000Z",
};

Deno.test("Turnstile verifier sends the private secret only to Siteverify", async () => {
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> = {};
  const fetcher: Fetcher = (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Promise.resolve(Response.json({
      success: true,
      hostname: "www.aethera.gr",
      action: "enquiry",
    }));
  };
  const verifier = createTurnstileVerifier({
    secretKey: "private-turnstile-secret",
    allowedHostnames: new Set(["www.aethera.gr"]),
    fetcher,
  });

  const result = await verifier.verify({
    token: "visitor-token",
    clientAddress: "203.0.113.10",
  });

  assertEquals(result, "valid");
  assertEquals(
    capturedUrl,
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  );
  assertEquals(capturedBody.secret, "private-turnstile-secret");
  assertEquals(capturedBody.response, "visitor-token");
  assertEquals(capturedBody.remoteip, "203.0.113.10");
  assertEquals("idempotency_key" in capturedBody, false);
});

Deno.test("Turnstile verifier rejects invalid, wrong-host, and wrong-action results", async () => {
  const createVerifier = (payload: Record<string, unknown>) =>
    createTurnstileVerifier({
      secretKey: "secret",
      allowedHostnames: new Set(["www.aethera.gr"]),
      fetcher: () => Promise.resolve(Response.json(payload)),
    });

  assertEquals(
    await createVerifier({
      success: false,
      "error-codes": ["invalid-input-response"],
    }).verify({
      token: "token",
      clientAddress: null,
    }),
    "invalid",
  );
  assertEquals(
    await createVerifier({
      success: true,
      hostname: "attacker.invalid",
      action: "enquiry",
    }).verify({
      token: "token",
      clientAddress: null,
    }),
    "invalid",
  );
  assertEquals(
    await createVerifier({
      success: true,
      hostname: "www.aethera.gr",
      action: "login",
    }).verify({
      token: "token",
      clientAddress: null,
    }),
    "invalid",
  );
});

Deno.test("Turnstile verifier distinguishes provider and configuration failures", async () => {
  const verifyError = async (errorCode: string) => {
    const verifier = createTurnstileVerifier({
      secretKey: "secret",
      allowedHostnames: new Set(["www.aethera.gr"]),
      fetcher: () =>
        Promise.resolve(Response.json({
          success: false,
          "error-codes": [errorCode],
        })),
    });
    return await verifier.verify({ token: "token", clientAddress: null });
  };

  assertEquals(await verifyError("internal-error"), "unavailable");
  assertEquals(await verifyError("invalid-input-secret"), "configuration_failure");

  const malformed = createTurnstileVerifier({
    secretKey: "secret",
    allowedHostnames: new Set(["www.aethera.gr"]),
    fetcher: () => Promise.resolve(Response.json({ success: false })),
  });
  assertEquals(
    await malformed.verify({ token: "token", clientAddress: null }),
    "unavailable",
  );
});

Deno.test("Turnstile verifier fails closed on timeout", async () => {
  const fetcher: Fetcher = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  const verifier = createTurnstileVerifier({
    secretKey: "secret",
    allowedHostnames: new Set(["www.aethera.gr"]),
    fetcher,
    timeoutMilliseconds: 1,
  });

  assertEquals(
    await verifier.verify({
      token: "token",
      clientAddress: null,
    }),
    "unavailable",
  );
});

Deno.test("Upstash limiter sends one atomic EVAL without the raw IP", async () => {
  let capturedBody = "";
  let capturedAuthorization = "";
  const limiter = createUpstashRateLimiter({
    restUrl: "https://example.upstash.io",
    restToken: "private-upstash-token",
    ipSalt: "0123456789abcdef0123456789abcdef",
    fetcher: (_input, init) => {
      capturedBody = String(init?.body);
      capturedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
      return Promise.resolve(Response.json({ result: [1, 0] }));
    },
  });

  assertEquals(await limiter.check("203.0.113.10", Date.now()), { status: "allowed" });
  assert(!capturedBody.includes("203.0.113.10"));
  assert(capturedBody.includes(JSON.stringify(RATE_LIMIT_SCRIPT)));
  assertEquals(capturedAuthorization, "Bearer private-upstash-token");
  const command = JSON.parse(capturedBody) as unknown[];
  assertEquals(command[0], "EVAL");
  assertEquals(command[2], 2);
  assertEquals(command.slice(-4), [5, 600000, 20, 86400000]);
});

Deno.test("Upstash limiter returns Retry-After and rejects malformed responses", async () => {
  const options = {
    restUrl: "https://example.upstash.io",
    restToken: "token",
    ipSalt: "0123456789abcdef0123456789abcdef",
  };
  const limited = createUpstashRateLimiter({
    ...options,
    fetcher: () => Promise.resolve(Response.json({ result: [0, 1001] })),
  });
  assertEquals(await limited.check(null, 0), {
    status: "limited",
    retryAfterSeconds: 2,
  });

  for (
    const payload of [
      { result: ["0", 1000] },
      { result: [0, -1] },
      { error: "Redis unavailable" },
      {},
    ]
  ) {
    const malformed = createUpstashRateLimiter({
      ...options,
      fetcher: () => Promise.resolve(Response.json(payload)),
    });
    assertEquals(await malformed.check(null, 0), { status: "unavailable" });
  }
});

Deno.test("Upstash limiter fails closed on HTTP errors and timeouts", async () => {
  const options = {
    restUrl: "https://example.upstash.io",
    restToken: "token",
    ipSalt: "0123456789abcdef0123456789abcdef",
  };
  const httpFailure = createUpstashRateLimiter({
    ...options,
    fetcher: () => Promise.resolve(new Response("unauthorized", { status: 401 })),
  });
  assertEquals(await httpFailure.check(null, 0), { status: "unavailable" });

  let requestCount = 0;
  const timeoutFetcher: Fetcher = (_input, init) => {
    requestCount += 1;
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  };
  const timeout = createUpstashRateLimiter({
    ...options,
    fetcher: timeoutFetcher,
    timeoutMilliseconds: 1,
  });
  assertEquals(await timeout.check(null, 0), { status: "unavailable" });
  assertEquals(requestCount, 1);
});

Deno.test("Resend request uses safe addressing, both bodies, and stable idempotency", async () => {
  const requests: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
  const service = createResendEmailService({
    apiKey: "private-resend-key",
    recipientEmail: "hello@aethera.gr",
    fromEmail: "AETHERA <enquiries@aethera.gr>",
    fetcher: (_input, init) => {
      requests.push({
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return Promise.resolve(Response.json({ id: "email-id" }));
    },
  });

  assertEquals(await service.send(enquiry, emailContext), "sent");
  assertEquals(await service.send(enquiry, emailContext), "sent");
  assertEquals(requests.length, 2);
  const first = requests[0];
  const second = requests[1];
  assert(first && second);
  assertEquals(first.body.from, "AETHERA <enquiries@aethera.gr>");
  assertEquals(first.body.to, ["hello@aethera.gr"]);
  assertEquals(first.body.reply_to, "alex@example.com");
  assert(typeof first.body.text === "string");
  assert(typeof first.body.html === "string");
  assert(!first.body.html.includes("<script>"));
  assert(first.body.html.includes("&lt;script&gt;"));
  assertEquals(
    first.headers.get("idempotency-key"),
    second.headers.get("idempotency-key"),
  );
  assertEquals(
    first.headers.get("idempotency-key"),
    `aethera-enquiry/${emailContext.submissionId}`,
  );
  assertEquals(first.headers.get("authorization"), "Bearer private-resend-key");
  assertEquals(first.headers.get("user-agent"), "AETHERA-Enquiry/1.0");
});

Deno.test("Resend idempotency identity does not change with a reused submission ID", async () => {
  const keys: string[] = [];
  const service = createResendEmailService({
    apiKey: "key",
    recipientEmail: "hello@aethera.gr",
    fromEmail: "enquiries@aethera.gr",
    fetcher: (_input, init) => {
      keys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
      return Promise.resolve(Response.json({ id: "email-id" }));
    },
  });

  await service.send(enquiry, emailContext);
  await service.send({ ...enquiry, requirements: "Edited after submit" }, emailContext);
  assertEquals(keys, [
    `aethera-enquiry/${emailContext.submissionId}`,
    `aethera-enquiry/${emailContext.submissionId}`,
  ]);
});

Deno.test("Resend classifies provider errors and timeouts without throwing", async () => {
  const options = {
    apiKey: "key",
    recipientEmail: "hello@aethera.gr",
    fromEmail: "enquiries@aethera.gr",
  };
  const temporary = createResendEmailService({
    ...options,
    fetcher: () => Promise.resolve(new Response("busy", { status: 503 })),
  });
  assertEquals(await temporary.send(enquiry, emailContext), "temporary_failure");

  const configuration = createResendEmailService({
    ...options,
    fetcher: () => Promise.resolve(new Response("unauthorized", { status: 401 })),
  });
  assertEquals(
    await configuration.send(enquiry, emailContext),
    "configuration_failure",
  );

  const malformedSuccess = createResendEmailService({
    ...options,
    fetcher: () => Promise.resolve(Response.json({ ok: true })),
  });
  assertEquals(
    await malformedSuccess.send(enquiry, emailContext),
    "temporary_failure",
  );

  const timeoutFetcher: Fetcher = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  const timeout = createResendEmailService({
    ...options,
    fetcher: timeoutFetcher,
    timeoutMilliseconds: 1,
  });
  assertEquals(await timeout.send(enquiry, emailContext), "temporary_failure");
});

Deno.test("provider deadlines include stalled successful response bodies", async () => {
  const stalledFetcher: Fetcher = () =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start() {
            // Deliberately never enqueue or close.
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      ),
    );

  const turnstile = createTurnstileVerifier({
    secretKey: "secret",
    allowedHostnames: new Set(["www.aethera.gr"]),
    fetcher: stalledFetcher,
    timeoutMilliseconds: 1,
  });
  const rateLimiter = createUpstashRateLimiter({
    restUrl: "https://example.upstash.io",
    restToken: "token",
    ipSalt: "0123456789abcdef0123456789abcdef",
    fetcher: stalledFetcher,
    timeoutMilliseconds: 1,
  });
  const emailService = createResendEmailService({
    apiKey: "key",
    recipientEmail: "hello@aethera.gr",
    fromEmail: "enquiries@aethera.gr",
    fetcher: stalledFetcher,
    timeoutMilliseconds: 1,
  });

  assertEquals(
    await turnstile.verify({ token: "token", clientAddress: null }),
    "unavailable",
  );
  assertEquals(await rateLimiter.check(null, 0), { status: "unavailable" });
  assertEquals(await emailService.send(enquiry, emailContext), "temporary_failure");
});
