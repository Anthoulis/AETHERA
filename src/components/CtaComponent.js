/**
 * Pre-footer CTA component shared across pages.
 */
export class CtaComponent {
  render() {
    const section = document.createElement("section");
    section.className = "cta";
    section.innerHTML = `
      <div class="container">
        <h2 data-i18n="home-cta-title">Let's discuss your next order</h2>
        <p data-i18n="home-cta-text">Share volumes, destination, and packaging. We return with a proposal within 24 hours.</p>
        <a href="contact.html" class="btn" data-i18n="home-cta-btn">Schedule a call with the wholesale team</a>
        <!-- CHANGE: subtle reassurance text under the CTA button. -->
        <p class="cta-note" data-i18n="home-cta-note">Wholesale &amp; export enquiries only. No obligation.</p>
      </div>`;
    return section;
  }
}
