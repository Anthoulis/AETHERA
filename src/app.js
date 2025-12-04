import { PageController } from "./controllers/PageController.js";
import { ProductController } from "./controllers/ProductController.js";
import { ContactController } from "./controllers/ContactController.js";

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

  if (document.body.classList.contains("page-contact")) {
    const contactController = new ContactController({ langManager: page.language });
    contactController.init();
  }
})();
