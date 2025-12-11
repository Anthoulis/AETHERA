import { LangDropdown } from "./LangDropdown.js";

/**
 * Header component: brand + nav + language dropdown.
 * Rendered once and shared across all pages.
 */
export class HeaderComponent {
  constructor({ langManager }) {
    this.langManager = langManager;
  }

  render() {
    const header = document.createElement("header");
    header.className = "site-header";
    header.innerHTML = `
      <div class="container">
        <a href="/index.html" class="brand">
          <img src="/assets/icons/logo.svg" alt="AETHERA Logo" class="logo">
          <div class="brand-text">
            <div class="brand-name gold-text">AETHERA</div>
            <div class="brand-tag gold-text" data-i18n="brand-tag">GREEK PREMIUM PRODUCTS</div>
          </div>
        </a>
        <div class="header-actions">
          <button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
            <span></span><span></span><span></span>
          </button>
          <nav class="main-nav">
            <a href="/index.html" data-i18n="nav-home">Home</a>
            <a href="/products.html" data-i18n="nav-products">Products</a>
            <a href="/about.html" data-i18n="nav-about">Company</a>
            <a href="/contact.html" data-i18n="nav-contact">Wholesale Enquiries</a>
          </nav>
          <div class="lang-slot"></div>
        </div>
      </div>`;

    // Insert language dropdown component.
    const dropdown = new LangDropdown({ langManager: this.langManager });
    header.querySelector(".lang-slot").append(dropdown.render());
    this._wireNav(header);
    return header;
  }

  /**
   * Wire up mobile nav toggle for the header.
   */
  _wireNav(header) {
    const toggle = header.querySelector(".nav-toggle");
    const nav = header.querySelector(".main-nav");
    const links = nav.querySelectorAll("a");

    const close = () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    };

    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    links.forEach(link => link.addEventListener("click", close));
  }
}
