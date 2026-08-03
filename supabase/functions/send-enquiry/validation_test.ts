import { assert, assertEquals } from "./test-utils.ts";
import { validateSubmission } from "./validation.ts";

const validSubmission = {
  company: "Aegean Foods",
  country: "Greece",
  contactPerson: "Alex Example",
  email: "alex@example.com",
  businessType: "food-importer",
  productInterest: "retail-and-bulk",
  annualVolume: "2 tonnes",
  requirements: "English labels\nDelivery in October",
  website: "",
  turnstileToken: "valid-token",
  formStartedAt: Date.parse("2026-08-03T11:59:55.000Z"),
  submittedAt: "2026-08-03T12:00:00.000Z",
  submissionId: "123e4567-e89b-42d3-a456-426614174000",
};

Deno.test("validation accepts and normalizes a valid submission", () => {
  const result = validateSubmission({
    ...validSubmission,
    company: "  Aegean Foods  ",
    email: "  Alex@Example.com  ",
    requirements: "First line\r\nSecond line",
  });

  assert(result.ok);
  assertEquals(result.value.company, "Aegean Foods");
  assertEquals(result.value.email, "Alex@Example.com");
  assertEquals(result.value.requirements, "First line\nSecond line");
});

Deno.test("validation reports missing and whitespace-only required fields", () => {
  const missing = { ...validSubmission } as Record<string, unknown>;
  delete missing.company;
  missing.country = "   ";

  const result = validateSubmission(missing);
  assert(!result.ok);
  assertEquals(result.fieldErrors.company, "required");
  assertEquals(result.fieldErrors.country, "required");
});

Deno.test("validation reports exact safe codes for field failures", () => {
  const result = validateSubmission({
    ...validSubmission,
    company: "A",
    country: "X".repeat(81),
    contactPerson: "Jane\nInjected",
    email: "not-an-email",
    businessType: "invented",
    productInterest: 42,
    annualVolume: { value: "2 tonnes" },
  });

  assert(!result.ok);
  assertEquals(result.fieldErrors.company, "tooShort");
  assertEquals(result.fieldErrors.country, "tooLong");
  assertEquals(result.fieldErrors.contactPerson, "invalidCharacters");
  assertEquals(result.fieldErrors.email, "invalidEmail");
  assertEquals(result.fieldErrors.businessType, "invalidOption");
  assertEquals(result.fieldErrors.productInterest, "invalidCharacters");
  assertEquals(result.fieldErrors.annualVolume, "invalidCharacters");
});

Deno.test("validation rejects oversized long text and null bytes", () => {
  const oversized = validateSubmission({
    ...validSubmission,
    requirements: "x".repeat(2001),
  });
  assert(!oversized.ok);
  assertEquals(oversized.fieldErrors.requirements, "tooLong");

  const unsafe = validateSubmission({
    ...validSubmission,
    requirements: "unsafe\u0000text",
  });
  assert(!unsafe.ok);
  assertEquals(unsafe.fieldErrors.requirements, "invalidCharacters");
});

Deno.test("validation rejects email subject and reply-to header injection", () => {
  const result = validateSubmission({
    ...validSubmission,
    company: "Aegean Foods\r\nBcc: attacker@example.com",
    email: "alex@example.com\r\n",
  });
  assert(!result.ok);
  assertEquals(result.fieldErrors.company, "invalidCharacters");
  assertEquals(result.fieldErrors.email, "invalidCharacters");
});

Deno.test("validation rejects C1 control characters", () => {
  const result = validateSubmission({
    ...validSubmission,
    company: "Aegean\u0085Foods",
    requirements: "Unsafe\u009Fmessage",
  });
  assert(!result.ok);
  assertEquals(result.fieldErrors.company, "invalidCharacters");
  assertEquals(result.fieldErrors.requirements, "invalidCharacters");
});

Deno.test("validation rejects unknown fields and invalid metadata", () => {
  const unexpected = validateSubmission({ ...validSubmission, admin: true });
  assert(!unexpected.ok);
  assertEquals(unexpected.fieldErrors, {});

  const invalidId = validateSubmission({
    ...validSubmission,
    submissionId: "not-a-uuid",
  });
  assert(!invalidId.ok);
  assertEquals(invalidId.fieldErrors, {});
});

Deno.test("validation treats missing token and filled honeypot as security failures", () => {
  const missingToken = validateSubmission({
    ...validSubmission,
    turnstileToken: "",
  });
  assert(!missingToken.ok);
  assertEquals(missingToken.securityFailure, true);

  const honeypot = validateSubmission({
    ...validSubmission,
    website: "https://bot.invalid",
  });
  assert(!honeypot.ok);
  assertEquals(honeypot.securityFailure, true);
});
