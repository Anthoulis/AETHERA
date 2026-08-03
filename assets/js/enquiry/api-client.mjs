export class EnquiryApiError extends Error {
  constructor(code, status = 0, fieldErrors = {}, retryAfterSeconds = null) {
    super(code);
    this.name = "EnquiryApiError";
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.retryAfterSeconds = retryAfterSeconds;
    this.status = status;
  }
}

const ALLOWED_FIELD_NAMES = new Set([
  "annualVolume",
  "businessType",
  "company",
  "contactPerson",
  "country",
  "email",
  "productInterest",
  "requirements",
]);
const ALLOWED_FIELD_ERROR_CODES = new Set([
  "invalidCharacters",
  "invalidEmail",
  "invalidOption",
  "required",
  "tooLong",
  "tooShort",
]);

export async function sendEnquiry(
  endpoint,
  payload,
  { fetchImplementation = globalThis.fetch, timeoutMs = 15_000 } = {},
) {
  const abortController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetchImplementation(endpoint, {
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
      redirect: "error",
      referrerPolicy: "strict-origin-when-cross-origin",
      signal: abortController.signal,
    });
    const responseBody = await readJsonResponse(response);

    if (!response.ok || responseBody?.ok !== true) {
      const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
      throw new EnquiryApiError(
        typeof responseBody?.code === "string" ? responseBody.code : "TEMPORARY_FAILURE",
        response.status,
        readFieldErrors(responseBody?.fieldErrors),
        retryAfter,
      );
    }

    return responseBody;
  } catch (error) {
    if (error instanceof EnquiryApiError) {
      throw error;
    }

    throw new EnquiryApiError("TEMPORARY_FAILURE");
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readFieldErrors(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const fieldErrors = {};
  for (const [field, code] of Object.entries(value)) {
    if (ALLOWED_FIELD_NAMES.has(field) && ALLOWED_FIELD_ERROR_CODES.has(code)) {
      fieldErrors[field] = code;
    }
  }
  return fieldErrors;
}

function parseRetryAfter(value) {
  if (!value || !/^\d+$/u.test(value)) {
    return null;
  }

  return Number(value);
}
