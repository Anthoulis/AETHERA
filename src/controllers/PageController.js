import { LanguageManager } from "../services/LanguageManager.js";
import { StorageService } from "../services/StorageService.js";
import { HeaderComponent } from "../components/HeaderComponent.js";
import { FooterComponent } from "../components/FooterComponent.js";
import { CtaComponent } from "../components/CtaComponent.js";

/**
 * Boots shared chrome (header/footer) and language layer for any page.
 * Page-specific controllers can be added later to extend functionality.
 */
export class PageController {
  constructor() {
    this.storage = new StorageService();
    this.langManager = new LanguageManager({ storage: this.storage, i18nPath: "/i18n", defaultLang: "en" });
  }

  /**
   * Expose the language manager so page-specific controllers can reuse it.
   */
  get language() {
    return this.langManager;
  }

  /**
   * Initialize the page: load language, render header/footer, re-apply translations.
   */
  async init() {
    await this.langManager.apply(this.langManager.current);
    this.renderChrome();
    await this.langManager.apply(this.langManager.current);
  }

  /**
   * Render header and footer into their placeholder mounts.
   */
  renderChrome() {
    const headerMount = document.getElementById("header") || this._ensure("header");
    const footerMount = document.getElementById("footer") || this._ensure("footer");
    const prefooterMount = document.getElementById("prefooter");

    headerMount.replaceChildren(new HeaderComponent({ langManager: this.langManager }).render());
    if (prefooterMount) {
      prefooterMount.replaceChildren(new CtaComponent().render());
    }
    footerMount.replaceChildren(new FooterComponent().render());
  }

  /**
   * Ensure a mount point exists; create and insert it if missing.
   * @param {"header"|"footer"} id
   * @returns {HTMLElement}
   */
  _ensure(id) {
    const node = document.createElement("div");
    node.id = id;
    if (id === "header") {
      document.body.prepend(node);
    } else {
      document.body.append(node);
    }
    return node;
  }
}
