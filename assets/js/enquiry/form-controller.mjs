import { sendEnquiry, EnquiryApiError } from "./api-client.mjs";
import {
  getEnquiryPublicConfig,
  isEnquiryPublicConfigReady,
} from "./config.mjs";
import {
  createSubmissionId,
  createSubmissionGate,
  shouldResetLogicalAttempt,
} from "./submission-gate.mjs";
import { createTurnstileController } from "./turnstile-client.mjs";
import { validateEnquiryValues } from "./validation.mjs";

const FIELD_NAMES = Object.freeze([
  "company",
  "country",
  "contactPerson",
  "email",
  "businessType",
  "productInterest",
  "annualVolume",
  "requirements",
]);

const ERROR_COPY_KEYS = Object.freeze({
  invalidCharacters: "errorInvalidCharacters",
  invalidEmail: "errorInvalidEmail",
  invalidOption: "errorInvalidOption",
  required: "errorRequired",
  tooLong: "errorTooLong",
  tooShort: "errorTooShort",
});

const STATUS_COPY_KEYS = Object.freeze({
  INTERNAL_ERROR: "statusFailure",
  INVALID_REQUEST: "statusInvalid",
  RATE_LIMITED: "statusRateLimit",
  SECURITY_CHECK_FAILED: "statusSecurity",
  TEMPORARY_FAILURE: "statusFailure",
  TEMPORARILY_UNAVAILABLE: "statusFailure",
});

initializeEnquiryForm();

function initializeEnquiryForm() {
  const form = document.querySelector("[data-enquiry-form]");
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const config = getEnquiryPublicConfig(window.location);
  const submitButton = form.querySelector("button[type='submit']");
  const status = document.querySelector("[data-form-status]");
  const turnstileContainer = form.querySelector("[data-turnstile-container]");

  if (
    !(submitButton instanceof HTMLButtonElement) ||
    !(status instanceof HTMLElement) ||
    !(turnstileContainer instanceof HTMLElement)
  ) {
    return;
  }

  const gate = createSubmissionGate();
  const mutableControls = [...form.querySelectorAll("input, select, textarea")]
    .filter(isFormField);
  const initiallyDisabledControls = new Set(
    mutableControls.filter((control) => control.disabled),
  );
  let formStartedAt = Date.now();
  let logicalAttempt = null;
  let mutationVersion = 0;
  let pendingTurnstileLanguage = null;
  let statusCopyKey = null;
  let turnstileController = null;
  let turnstileToken = "";

  form.addEventListener("submit", handleSubmit);
  form.addEventListener("input", handleFormMutation);
  form.addEventListener("change", handleFormMutation);
  window.addEventListener("aethera:languagechange", handleLanguageChange);

  if (!isEnquiryPublicConfigReady(config)) {
    showStatus("error", "statusUnavailable");
    updateSubmitButton();
    return;
  }

  showStatus("pending", "turnstileLoading");
  initializeTurnstile().catch(() => {
    showStatus("error", "turnstileUnavailable");
    updateSubmitButton();
  });

  async function initializeTurnstile() {
    turnstileController = await createTurnstileController({
      container: turnstileContainer,
      language: document.documentElement.lang,
      onTokenChange(token) {
        turnstileToken = token;
        if (token && [
          "statusSecurity",
          "turnstileLoading",
          "turnstileUnavailable",
        ].includes(statusCopyKey)) {
          hideStatus();
        }
        updateSubmitButton();
      },
      onUnavailable() {
        showStatus("error", "turnstileUnavailable");
        updateSubmitButton();
      },
      siteKey: config.turnstileSiteKey,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!gate.tryStart()) {
      return;
    }

    const { errors, values } = validateEnquiryValues(readFormValues(form));
    clearFieldErrors();

    if (Object.keys(errors).length > 0) {
      showFieldErrors(errors);
      showStatus("error", "statusInvalid");
      gate.finish();
      updateSubmitButton();
      focusFirstInvalidField(errors);
      return;
    }

    if (!turnstileToken) {
      showStatus("error", "statusSecurity", true);
      gate.finish();
      updateSubmitButton();
      return;
    }

    if (!logicalAttempt) {
      const submissionId = createSubmissionId();
      if (!submissionId) {
        showStatus("error", "statusFailure", true);
        gate.finish();
        updateSubmitButton();
        return;
      }

      logicalAttempt = {
        submissionId,
        submittedAt: new Date().toISOString(),
      };
    }

    const submittedMutationVersion = mutationVersion;
    const payload = {
      ...values,
      formStartedAt,
      submissionId: logicalAttempt.submissionId,
      submittedAt: logicalAttempt.submittedAt,
      turnstileToken,
    };

    setSubmitting(true);
    updateSubmitButton();
    showStatus("pending", "statusSending");

    try {
      await sendEnquiry(config.functionUrl, payload, {
        timeoutMs: config.requestTimeoutMs,
      });

      if (mutationVersion === submittedMutationVersion) {
        form.reset();
        clearFieldErrors();
        formStartedAt = Date.now();
        mutationVersion += 1;
      }
      logicalAttempt = null;
      showStatus("success", "statusSuccess", true);
    } catch (error) {
      const apiError = error instanceof EnquiryApiError
        ? error
        : new EnquiryApiError("TEMPORARY_FAILURE");

      if (Object.keys(apiError.fieldErrors).length > 0) {
        showFieldErrors(apiError.fieldErrors);
        focusFirstInvalidField(apiError.fieldErrors);
      }

      if (shouldResetLogicalAttempt(apiError.status)) {
        logicalAttempt = null;
      }

      const copyKey = STATUS_COPY_KEYS[apiError.code] ?? "statusFailure";
      showStatus("error", copyKey, Object.keys(apiError.fieldErrors).length === 0);
    } finally {
      // Turnstile tokens are single-use; always acquire a fresh token for retry.
      if (pendingTurnstileLanguage) {
        turnstileController?.renderForLanguage(pendingTurnstileLanguage);
        pendingTurnstileLanguage = null;
      } else {
        turnstileController?.reset();
      }
      setSubmitting(false);
      gate.finish();
      updateSubmitButton();
    }
  }

  function handleFormMutation(event) {
    if (!(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLSelectElement) &&
        !(event.target instanceof HTMLTextAreaElement)) {
      return;
    }

    mutationVersion += 1;
    logicalAttempt = null;
    clearFieldError(event.target.name);

    if (!gate.isActive() && statusCopyKey !== "turnstileLoading") {
      hideStatus();
    }
  }

  function handleLanguageChange() {
    refreshVisibleFieldErrors();

    if (statusCopyKey) {
      status.textContent = copy(statusCopyKey);
    }

    if (gate.isActive()) {
      submitButton.textContent = copy("statusSending");
      pendingTurnstileLanguage = document.documentElement.lang;
      return;
    }

    submitButton.textContent = copy("submit");
    turnstileController?.renderForLanguage(document.documentElement.lang);
  }

  function setSubmitting(isSubmitting) {
    form.setAttribute("aria-busy", String(isSubmitting));
    submitButton.textContent = copy(isSubmitting ? "statusSending" : "submit");
    mutableControls.forEach((control) => {
      control.disabled = isSubmitting || initiallyDisabledControls.has(control);
    });
  }

  function updateSubmitButton() {
    submitButton.disabled = gate.isActive() || !turnstileToken || !turnstileController;
  }

  function showStatus(type, copyKey, shouldFocus = false) {
    statusCopyKey = copyKey;
    status.classList.remove("error", "pending", "success");
    status.classList.add(type);
    status.setAttribute("role", type === "error" ? "alert" : "status");
    status.textContent = copy(copyKey);
    status.hidden = false;

    if (shouldFocus) {
      status.focus();
    }
  }

  function hideStatus() {
    statusCopyKey = null;
    status.hidden = true;
    status.textContent = "";
    status.classList.remove("error", "pending", "success");
  }

  function showFieldErrors(errors) {
    for (const [fieldName, errorCode] of Object.entries(errors)) {
      const field = form.elements.namedItem(fieldName);
      const error = form.querySelector(`[data-field-error="${fieldName}"]`);
      const copyKey = ERROR_COPY_KEYS[errorCode] ?? "errorInvalidCharacters";

      if (isFormField(field) && error instanceof HTMLElement) {
        field.setAttribute("aria-invalid", "true");
        error.dataset.errorCopy = copyKey;
        error.textContent = copy(copyKey);
        error.hidden = false;
      }
    }
  }

  function clearFieldErrors() {
    FIELD_NAMES.forEach(clearFieldError);
  }

  function clearFieldError(fieldName) {
    const field = form.elements.namedItem(fieldName);
    const error = form.querySelector(`[data-field-error="${fieldName}"]`);

    if (isFormField(field)) {
      field.removeAttribute("aria-invalid");
    }
    if (error instanceof HTMLElement) {
      delete error.dataset.errorCopy;
      error.textContent = "";
      error.hidden = true;
    }
  }

  function refreshVisibleFieldErrors() {
    form.querySelectorAll("[data-field-error][data-error-copy]").forEach((error) => {
      error.textContent = copy(error.dataset.errorCopy);
    });
  }

  function focusFirstInvalidField(errors) {
    const firstFieldName = FIELD_NAMES.find((fieldName) => errors[fieldName]);
    const field = firstFieldName ? form.elements.namedItem(firstFieldName) : null;
    if (isFormField(field)) {
      field.focus();
    }
  }
}

function readFormValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function isFormField(field) {
  return field instanceof HTMLInputElement ||
    field instanceof HTMLSelectElement ||
    field instanceof HTMLTextAreaElement;
}

function copy(key) {
  const source = document.querySelector(`[data-enquiry-copy="${key}"]`);
  return source?.textContent?.trim() || "";
}
