import { formsConfig } from "../config/forms.js";

const DEFAULT_ENDPOINT = formsConfig.wholesaleEndpoint;

/**
 * Handles client-side submission for the wholesale enquiry form.
 * Uses a form backend (default: FormSubmit) so the static site can send emails.
 */
export class ContactController {
  constructor({ langManager }) {
    this.langManager = langManager;
  }

  /**
   * Wire up the form if present on the page.
   */
  init() {
    this.form = document.querySelector("[data-wholesale-form]");
    if (!this.form) return;

    this.endpoint = this.form.dataset.endpoint || DEFAULT_ENDPOINT;
    this.statusNode = document.querySelector("[data-form-status]");
    this.submitBtn = this.form.querySelector("button[type='submit']");
    this.defaultBtnText = this.submitBtn?.textContent || "";

    this.form.addEventListener("submit", (event) => this.handleSubmit(event));
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (!this.endpoint) {
      this.showStatus("error", this.t("contact-status-missing-endpoint", "Form endpoint missing. Set formsConfig.wholesaleEndpoint."));
      return;
    }

    const formData = Object.fromEntries(new FormData(this.form));
    this.setSubmitting(true);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          ...formData,
          _subject: "AETHERA wholesale enquiry",
          source: "aethera-website",
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || `HTTP ${response.status}`);
      }

      this.form.reset();
      this.showStatus("success", this.t("contact-status-success", "Thank you - your enquiry was sent. We'll reply within 24 hours."));
    } catch (err) {
      console.error("Wholesale form submission failed:", err);
      this.showStatus("error", this.t("contact-status-error", "We couldn't send this right now. Please email hello@aethera.gr."));
    } finally {
      this.setSubmitting(false);
    }
  }

  setSubmitting(isSubmitting) {
    if (!this.submitBtn) return;
    this.submitBtn.disabled = isSubmitting;
    this.submitBtn.textContent = isSubmitting ? this.t("contact-status-sending", "Sending...") : this.defaultBtnText;
  }

  showStatus(type, message) {
    if (!this.statusNode) return;
    this.statusNode.textContent = message;
    this.statusNode.classList.remove("success", "error", "show");
    this.statusNode.classList.add(type, "show");
    this.statusNode.setAttribute("role", type === "error" ? "alert" : "status");
  }

  t(key, fallback) {
    const dict = this.langManager?.cache?.get?.(this.langManager.current);
    return dict?.[key] || fallback;
  }
}
