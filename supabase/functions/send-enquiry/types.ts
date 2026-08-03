export const BUSINESS_TYPES = [
  "wholesaler-distributor",
  "retail-chain",
  "food-importer",
  "specialty-retail",
  "horeca",
  "other",
] as const;

export const PRODUCT_INTERESTS = [
  "retail",
  "bulk",
  "retail-and-bulk",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];
export type ProductInterest = (typeof PRODUCT_INTERESTS)[number];

export interface Enquiry {
  company: string;
  country: string;
  contactPerson: string;
  email: string;
  businessType: BusinessType;
  productInterest: ProductInterest;
  annualVolume: string;
  requirements: string;
}

export interface EnquirySubmission extends Enquiry {
  website: string;
  turnstileToken: string;
  formStartedAt: number;
  submittedAt: string;
  submittedAtMs: number;
  submissionId: string;
}

export type EnquiryField = keyof Enquiry;

export type FieldErrorCode =
  | "required"
  | "tooShort"
  | "tooLong"
  | "invalidEmail"
  | "invalidOption"
  | "invalidCharacters";

export type FieldErrors = Partial<Record<EnquiryField, FieldErrorCode>>;

export interface AppConfig {
  allowedOrigins: ReadonlySet<string>;
  allowedTurnstileHostnames: ReadonlySet<string>;
  resendApiKey: string;
  enquiryRecipientEmail: string;
  enquiryFromEmail: string;
  turnstileSecretKey: string;
  upstashRedisRestUrl: string;
  upstashRedisRestToken: string;
  rateLimitIpSalt: string;
}

export interface TurnstileVerifier {
  verify(input: {
    token: string;
    clientAddress: string | null;
  }): Promise<"valid" | "invalid" | "unavailable" | "configuration_failure">;
}

export type RateLimitResult =
  | { status: "allowed" }
  | { status: "limited"; retryAfterSeconds: number }
  | { status: "unavailable" };

export interface RateLimiter {
  check(clientAddress: string | null, nowMs: number): Promise<RateLimitResult>;
}

export interface EmailService {
  send(
    enquiry: Enquiry,
    context: { submissionId: string; submittedAt: string },
  ): Promise<"sent" | "temporary_failure" | "configuration_failure">;
}

export interface SafeLogger {
  error(event: string, requestId: string): void;
}

export interface HandlerDependencies {
  config: Pick<AppConfig, "allowedOrigins">;
  turnstileVerifier: TurnstileVerifier;
  rateLimiter: RateLimiter;
  emailService: EmailService;
  now: () => number;
  randomUUID: () => string;
  logger: SafeLogger;
}

export type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
