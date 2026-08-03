import assert from "node:assert/strict";
import test from "node:test";

import {
  EnquiryApiError,
  sendEnquiry,
} from "../assets/js/enquiry/api-client.mjs";
import {
  createSubmissionId,
  createSubmissionGate,
  shouldResetLogicalAttempt,
} from "../assets/js/enquiry/submission-gate.mjs";
import { validateEnquiryValues } from "../assets/js/enquiry/validation.mjs";

const VALID_VALUES = Object.freeze({
  annualVolume: "2 tonnes per year",
  businessType: "wholesaler-distributor",
  company: "Example Foods",
  contactPerson: "Alex Example",
  country: "Greece",
  email: "alex@example.com",
  productInterest: "retail-and-bulk",
  requirements: "Please share your available formats.",
  website: "",
});

test("valid enquiry values are trimmed and accepted", () => {
  const result = validateEnquiryValues({
    ...VALID_VALUES,
    company: "  Example Foods  ",
  });

  assert.deepEqual(result.errors, {});
  assert.equal(result.values.company, "Example Foods");
});

test("missing and whitespace-only required fields are rejected", () => {
  const result = validateEnquiryValues({
    ...VALID_VALUES,
    company: "   ",
    country: "",
  });

  assert.equal(result.errors.company, "required");
  assert.equal(result.errors.country, "required");
});

test("invalid emails and unexpected select values are rejected", () => {
  const result = validateEnquiryValues({
    ...VALID_VALUES,
    businessType: "administrator",
    email: "not-an-email",
    productInterest: "everything",
  });

  assert.equal(result.errors.email, "invalidEmail");
  assert.equal(result.errors.businessType, "invalidOption");
  assert.equal(result.errors.productInterest, "invalidOption");
});

test("oversized fields and control characters are rejected", () => {
  const result = validateEnquiryValues({
    ...VALID_VALUES,
    company: "A".repeat(121),
    contactPerson: "Alex\r\nBcc: attacker@example.com",
    requirements: `Valid text\u0085hidden`,
  });

  assert.equal(result.errors.company, "tooLong");
  assert.equal(result.errors.contactPerson, "invalidCharacters");
  assert.equal(result.errors.requirements, "invalidCharacters");
});

test("submission gate rejects rapid duplicate starts", () => {
  const gate = createSubmissionGate();

  assert.equal(gate.tryStart(), true);
  assert.equal(gate.tryStart(), false);
  assert.equal(gate.isActive(), true);
  gate.finish();
  assert.equal(gate.tryStart(), true);
});

test("submission identifiers fail closed when secure UUIDs are unavailable", () => {
  assert.equal(createSubmissionId(null), null);
  assert.equal(createSubmissionId({ randomUUID: null }), null);
  assert.equal(createSubmissionId({ randomUUID() { throw new Error("blocked"); } }), null);
  assert.equal(
    createSubmissionId({ randomUUID: () => "20e9308e-60c5-4b6f-9e71-4a74d9258c55" }),
    "20e9308e-60c5-4b6f-9e71-4a74d9258c55",
  );
});

test("definitive client rejections start a fresh logical attempt", () => {
  assert.equal(shouldResetLogicalAttempt(400), true);
  assert.equal(shouldResetLogicalAttempt(403), true);
  assert.equal(shouldResetLogicalAttempt(429), false);
  assert.equal(shouldResetLogicalAttempt(0), false);
  assert.equal(shouldResetLogicalAttempt(500), false);
  assert.equal(shouldResetLogicalAttempt(502), false);
});

test("API client returns a successful structured response", async () => {
  const result = await sendEnquiry("https://example.test/send", VALID_VALUES, {
    fetchImplementation: async () => jsonResponse(200, {
      ok: true,
      submissionId: "20e9308e-60c5-4b6f-9e71-4a74d9258c55",
    }),
  });

  assert.equal(result.ok, true);
});

test("API client preserves safe field errors from the backend contract", async () => {
  await assert.rejects(
    sendEnquiry("https://example.test/send", VALID_VALUES, {
      fetchImplementation: async () => jsonResponse(400, {
        code: "INVALID_REQUEST",
        fieldErrors: { email: "invalidEmail" },
        ok: false,
      }),
    }),
    (error) => {
      assert.ok(error instanceof EnquiryApiError);
      assert.equal(error.code, "INVALID_REQUEST");
      assert.equal(error.fieldErrors.email, "invalidEmail");
      return true;
    },
  );
});

test("API client ignores unexpected field-error names and codes", async () => {
  await assert.rejects(
    sendEnquiry("https://example.test/send", VALID_VALUES, {
      fetchImplementation: async () => jsonResponse(400, {
        code: "INVALID_REQUEST",
        fieldErrors: {
          company: "not-a-public-code",
          email: "invalidEmail",
          'email\"]': "required",
        },
        ok: false,
      }),
    }),
    (error) => {
      assert.deepEqual(error.fieldErrors, { email: "invalidEmail" });
      return true;
    },
  );
});

test("API client parses rate-limit retry guidance", async () => {
  await assert.rejects(
    sendEnquiry("https://example.test/send", VALID_VALUES, {
      fetchImplementation: async () => jsonResponse(
        429,
        { code: "RATE_LIMITED", ok: false },
        { "Retry-After": "600" },
      ),
    }),
    (error) => {
      assert.ok(error instanceof EnquiryApiError);
      assert.equal(error.status, 429);
      assert.equal(error.retryAfterSeconds, 600);
      return true;
    },
  );
});

test("API client turns invalid JSON and timeouts into generic failures", async () => {
  await assert.rejects(
    sendEnquiry("https://example.test/send", VALID_VALUES, {
      fetchImplementation: async () => new Response("not json", {
        headers: { "Content-Type": "application/json" },
        status: 502,
      }),
    }),
    (error) => error instanceof EnquiryApiError &&
      error.code === "TEMPORARY_FAILURE",
  );

  await assert.rejects(
    sendEnquiry("https://example.test/send", VALID_VALUES, {
      fetchImplementation: (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      }),
      timeoutMs: 1,
    }),
    (error) => error instanceof EnquiryApiError &&
      error.code === "TEMPORARY_FAILURE",
  );
});

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
    status,
  });
}
