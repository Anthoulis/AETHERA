import { ProductCard } from "../components/ProductCard.js";
import { productFacts } from "../data/productFacts.js";

/**
 * Renders data-driven product fact cards for the products page.
 */
export class ProductController {
  constructor({ langManager }) {
    this.langManager = langManager;
  }

  /**
   * Render quick-facts cards and re-apply translations so they localize immediately.
   */
  async init() {
    this.renderFacts();
    await this.langManager.apply(this.langManager.current);
  }

  renderFacts() {
    const mount = document.getElementById("product-facts");
    if (!mount) return;
    mount.innerHTML = "";
    productFacts.forEach(fact => {
      const card = new ProductCard(fact).render();
      mount.appendChild(card);
    });
  }
}
