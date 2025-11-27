import { PageController } from "./controllers/PageController.js";
import { ProductController } from "./controllers/ProductController.js";

/**
 * App entrypoint. Boots shared chrome and language layer.
 * Page-specific controllers can be added here based on body classes.
 */
(async () => {
  const page = new PageController();
  await page.init();

  // Page-specific bootstraps
  if (document.body.classList.contains("page-products")) {
    const productController = new ProductController({ langManager: page.language });
    await productController.init();
  }
})();
