/**
 * Footer component shared across pages.
 */
export class FooterComponent {
  render() {
    const footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="container">
        <p data-i18n="footer-copy">© 2025 AETHERA. All rights reserved.</p>
        <nav class="footer-nav">
          <a href="/legal/privacy.html" data-i18n="footer-privacy">Privacy Policy</a>
          <a href="/legal/terms.html" data-i18n="footer-terms">Terms &amp; Conditions</a>
        </nav>
      </div>`;
    return footer;
  }
}
