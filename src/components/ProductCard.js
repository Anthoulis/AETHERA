/**
 * Reusable product card used for quick facts on the products page.
 * Accepts translation keys so LanguageManager can localize the content.
 */
export class ProductCard {
  constructor({ icon, titleKey, textKey }) {
    this.icon = icon;
    this.titleKey = titleKey;
    this.textKey = textKey;
  }

  render() {
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <div class="fact-icon"><img src="${this.icon}" alt=""></div>
      <h3 data-i18n="${this.titleKey}">${this.titleKey}</h3>
      <p data-i18n="${this.textKey}">${this.textKey}</p>
    `;
    return card;
  }
}
