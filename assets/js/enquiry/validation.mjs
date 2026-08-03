export const BUSINESS_TYPES = Object.freeze([
  "wholesaler-distributor",
  "retail-chain",
  "food-importer",
  "specialty-retail",
  "horeca",
  "other",
]);

export const PRODUCT_INTERESTS = Object.freeze([
  "retail",
  "bulk",
  "retail-and-bulk",
]);

const BUSINESS_TYPE_SET = new Set(BUSINESS_TYPES);
const PRODUCT_INTEREST_SET = new Set(PRODUCT_INTERESTS);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
const SINGLE_LINE_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const MULTILINE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/u;

const FIELD_RULES = Object.freeze({
  company: { required: true, minimum: 2, maximum: 120 },
  country: { required: true, minimum: 2, maximum: 80 },
  contactPerson: { required: true, minimum: 2, maximum: 100 },
  email: { required: true, minimum: 3, maximum: 160, email: true },
  annualVolume: { required: true, minimum: 2, maximum: 100 },
  requirements: { required: false, maximum: 2_000, multiline: true },
});

export function validateEnquiryValues(rawValues) {
  const values = {
    company: normalizeSingleLine(rawValues.company),
    country: normalizeSingleLine(rawValues.country),
    contactPerson: normalizeSingleLine(rawValues.contactPerson),
    email: normalizeSingleLine(rawValues.email),
    businessType: normalizeSingleLine(rawValues.businessType),
    productInterest: normalizeSingleLine(rawValues.productInterest),
    annualVolume: normalizeSingleLine(rawValues.annualVolume),
    requirements: normalizeMultiline(rawValues.requirements),
    website: normalizeSingleLine(rawValues.website),
  };
  const errors = {};

  for (const [field, rules] of Object.entries(FIELD_RULES)) {
    const value = values[field];
    const invalidCharacters = rules.multiline
      ? MULTILINE_CONTROL_CHARACTERS.test(value)
      : SINGLE_LINE_CONTROL_CHARACTERS.test(value);

    if (rules.required && value.length === 0) {
      errors[field] = "required";
    } else if (invalidCharacters) {
      errors[field] = "invalidCharacters";
    } else if (rules.minimum && value.length < rules.minimum) {
      errors[field] = "tooShort";
    } else if (value.length > rules.maximum) {
      errors[field] = "tooLong";
    } else if (rules.email && !EMAIL_PATTERN.test(value)) {
      errors[field] = "invalidEmail";
    }
  }

  if (!BUSINESS_TYPE_SET.has(values.businessType)) {
    errors.businessType = values.businessType ? "invalidOption" : "required";
  }

  if (!PRODUCT_INTEREST_SET.has(values.productInterest)) {
    errors.productInterest = values.productInterest ? "invalidOption" : "required";
  }

  return { errors, values };
}

function normalizeSingleLine(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMultiline(value) {
  return typeof value === "string"
    ? value.replace(/\r\n?/gu, "\n").trim()
    : "";
}
