/**
 * Language dropdown component with EN/DE/EL options.
 * Emits changes to LanguageManager and updates its own UI state.
 */
export class LangDropdown {
  constructor({ langManager }) {
    this.langManager = langManager;
    this.el = null;
  }

  render() {
    const wrapper = document.createElement("div");
    wrapper.className = "lang-dropdown";
    wrapper.innerHTML = `
      <button class="lang-toggle" aria-haspopup="listbox" aria-expanded="false">
        <span class="lang-flag" aria-hidden="true">EN</span>
        <span class="lang-label">English</span>
      </button>
      <div class="lang-menu" role="listbox">
        ${this._options()}
      </div>`;
    this.el = wrapper;
    this._bind();
    return wrapper;
  }

  _options() {
    const labels = { en: "English", de: "Deutsch", el: "Ελληνικά" };
    return ["en", "de", "el"].map(code => `
      <button role="option" data-lang="${code}" data-flag="${code.toUpperCase()}">
        <span class="lang-flag">${code.toUpperCase()}</span> ${labels[code]}
      </button>`).join("");
  }

  _bind() {
    const toggle = this.el.querySelector(".lang-toggle");
    const buttons = this.el.querySelectorAll(".lang-menu button");

    toggle.addEventListener("click", () => {
      const open = this.el.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    buttons.forEach(btn => btn.addEventListener("click", async () => {
      const lang = btn.dataset.lang;
      await this.langManager.apply(lang);
      this._sync(lang);
      this.el.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }));

    document.addEventListener("click", e => {
      if (!this.el.contains(e.target)) {
        this.el.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    this._sync(this.langManager.current);
  }

  _sync(lang) {
    const toggle = this.el.querySelector(".lang-toggle");
    const labels = { en: "English", de: "Deutsch", el: "Ελληνικά" };
    const flag = this.el.querySelector(`[data-lang="${lang}"]`)?.dataset.flag || "EN";
    toggle.querySelector(".lang-flag").textContent = flag;
    toggle.querySelector(".lang-label").textContent = labels[lang] || labels.en;
    this.el.querySelectorAll("button[role='option']").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });
  }
}
