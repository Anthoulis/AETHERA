import {
  BUSINESS_TYPES,
  type BusinessType,
  type EnquiryField,
  type EnquirySubmission,
  type FieldErrorCode,
  type FieldErrors,
  PRODUCT_INTERESTS,
  type ProductInterest,
} from "./types.ts";

const REQUEST_KEYS = new Set([
  "company",
  "country",
  "contactPerson",
  "email",
  "businessType",
  "productInterest",
  "annualVolume",
  "requirements",
  "website",
  "turnstileToken",
  "formStartedAt",
  "submittedAt",
  "submissionId",
]);

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CANONICAL_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function hasUnsafeShortText(value: string): boolean {
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

function hasUnsafeLongText(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    const isDisallowedC0 = codePoint <= 8 || codePoint === 11 || codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31);
    if (isDisallowedC0 || (codePoint >= 127 && codePoint <= 159)) {
      return true;
    }
  }
  return false;
}

export type ValidationResult =
  | { ok: true; value: EnquirySubmission }
  | {
    ok: false;
    fieldErrors: FieldErrors;
    securityFailure: boolean;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValidEmailSyntax(value: string): boolean {
  const atIndex = value.lastIndexOf("@");
  if (atIndex <= 0 || atIndex > 64 || atIndex === value.length - 1) {
    return false;
  }

  const localPart = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (
    localPart.startsWith(".") || localPart.endsWith(".") ||
    localPart.includes("..") || !domain.includes(".")
  ) {
    return false;
  }

  const localPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/iu;
  const domainLabel = /^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/iu;
  return localPattern.test(localPart) &&
    domain.split(".").every((label) => domainLabel.test(label));
}

function setFieldError(
  errors: FieldErrors,
  field: EnquiryField,
  code: FieldErrorCode,
): void {
  if (!errors[field]) {
    errors[field] = code;
  }
}

function readShortText(
  body: Record<string, unknown>,
  errors: FieldErrors,
  field: EnquiryField,
  minimumLength: number,
  maximumLength: number,
): string {
  const rawValue = body[field];
  if (typeof rawValue !== "string") {
    setFieldError(
      errors,
      field,
      rawValue === undefined || rawValue === null ? "required" : "invalidCharacters",
    );
    return "";
  }

  const value = rawValue.trim();
  if (hasUnsafeShortText(rawValue)) {
    setFieldError(errors, field, "invalidCharacters");
  } else if (value.length === 0) {
    setFieldError(errors, field, "required");
  } else if (value.length < minimumLength) {
    setFieldError(errors, field, "tooShort");
  } else if (value.length > maximumLength) {
    setFieldError(errors, field, "tooLong");
  }
  return value;
}

function readOption<T extends string>(
  body: Record<string, unknown>,
  errors: FieldErrors,
  field: EnquiryField,
  allowedValues: readonly [T, ...T[]],
): T {
  const rawValue = body[field];
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    setFieldError(errors, field, "required");
    return allowedValues[0];
  }
  if (typeof rawValue !== "string") {
    setFieldError(errors, field, "invalidCharacters");
    return allowedValues[0];
  }
  if (rawValue.trim().length === 0) {
    setFieldError(errors, field, "required");
    return allowedValues[0];
  }

  const value = rawValue.trim();
  if (hasUnsafeShortText(rawValue)) {
    setFieldError(errors, field, "invalidCharacters");
  } else if (!allowedValues.includes(value as T)) {
    setFieldError(errors, field, "invalidOption");
  }
  return value as T;
}

function readEmail(
  body: Record<string, unknown>,
  errors: FieldErrors,
): string {
  const email = readShortText(body, errors, "email", 5, 160);
  if (!errors.email && !hasValidEmailSyntax(email)) {
    setFieldError(errors, "email", "invalidEmail");
  }
  return email;
}

function readRequirements(
  body: Record<string, unknown>,
  errors: FieldErrors,
): string {
  const rawValue = body.requirements;
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return "";
  }
  if (typeof rawValue !== "string") {
    setFieldError(errors, "requirements", "invalidCharacters");
    return "";
  }

  const value = rawValue.replace(/\r\n?/gu, "\n").trim();
  if (hasUnsafeLongText(rawValue)) {
    setFieldError(errors, "requirements", "invalidCharacters");
  } else if (value.length > 2000) {
    setFieldError(errors, "requirements", "tooLong");
  }
  return value;
}

function parseSubmittedAt(value: unknown): { text: string; milliseconds: number } | null {
  if (typeof value !== "string" || !CANONICAL_UTC_TIMESTAMP.test(value)) {
    return null;
  }

  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    return null;
  }
  return { text: value, milliseconds };
}

export function validateSubmission(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    return { ok: false, fieldErrors: {}, securityFailure: false };
  }

  if (Object.keys(input).some((key) => !REQUEST_KEYS.has(key))) {
    return { ok: false, fieldErrors: {}, securityFailure: false };
  }

  const fieldErrors: FieldErrors = {};
  const company = readShortText(input, fieldErrors, "company", 2, 120);
  const country = readShortText(input, fieldErrors, "country", 2, 80);
  const contactPerson = readShortText(
    input,
    fieldErrors,
    "contactPerson",
    2,
    100,
  );
  const email = readEmail(input, fieldErrors);
  const businessType = readOption(
    input,
    fieldErrors,
    "businessType",
    BUSINESS_TYPES,
  ) as BusinessType;
  const productInterest = readOption(
    input,
    fieldErrors,
    "productInterest",
    PRODUCT_INTERESTS,
  ) as ProductInterest;
  const annualVolume = readShortText(
    input,
    fieldErrors,
    "annualVolume",
    2,
    100,
  );
  const requirements = readRequirements(input, fieldErrors);

  const website = typeof input.website === "string" ? input.website : "";
  const turnstileToken = typeof input.turnstileToken === "string"
    ? input.turnstileToken.trim()
    : "";
  const securityFailure = typeof input.website !== "string" ||
    website.trim().length > 0 || typeof input.turnstileToken !== "string" ||
    turnstileToken.length === 0 || turnstileToken.length > 2048 ||
    (typeof input.turnstileToken === "string" &&
      hasUnsafeShortText(input.turnstileToken));

  const formStartedAt = input.formStartedAt;
  const submittedAt = parseSubmittedAt(input.submittedAt);
  const submissionId = typeof input.submissionId === "string"
    ? input.submissionId.trim().toLowerCase()
    : "";
  const invalidMetadata = typeof formStartedAt !== "number" ||
    !Number.isSafeInteger(formStartedAt) || formStartedAt < 0 ||
    submittedAt === null || !UUID_V4.test(submissionId);

  if (
    Object.keys(fieldErrors).length > 0 || securityFailure || invalidMetadata ||
    submittedAt === null || typeof formStartedAt !== "number"
  ) {
    return { ok: false, fieldErrors, securityFailure };
  }

  return {
    ok: true,
    value: {
      company,
      country,
      contactPerson,
      email,
      businessType,
      productInterest,
      annualVolume,
      requirements,
      website,
      turnstileToken,
      formStartedAt,
      submittedAt: submittedAt.text,
      submittedAtMs: submittedAt.milliseconds,
      submissionId,
    },
  };
}
