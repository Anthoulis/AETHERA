const DEFAULT_LANGUAGE = "en";
const SUPPORTED_LANGUAGES = ["en", "de", "el"];
const LANGUAGE_LABELS = {
  en: "English",
  de: "Deutsch",
  el: "Ελληνικά",
};
const LANGUAGE_STORAGE_KEY = "aethera:lang";

const translationCache = new Map();
let activeLanguage = DEFAULT_LANGUAGE;
let languageRequestId = 0;

initializeSite().catch(function (error) {
  console.error("AETHERA site initialization failed.", error);
});

async function initializeSite() {
  renderSharedLayout();
  initializeNavigation();
  initializeLanguageMenu();

  const storedLanguage = readStoredLanguage();

  try {
    await setLanguage(storedLanguage, { persist: false });
  } catch (error) {
    console.error(`Initial ${storedLanguage} translation load failed.`, error);

    if (storedLanguage !== DEFAULT_LANGUAGE) {
      try {
        await setLanguage(DEFAULT_LANGUAGE, { persist: false });
      } catch (fallbackError) {
        console.error("English translation fallback failed.", fallbackError);
      }
    }

    document.documentElement.lang = DEFAULT_LANGUAGE;
    syncLanguageMenu(DEFAULT_LANGUAGE);
    writeStoredLanguage(DEFAULT_LANGUAGE);
  }

}

function renderSharedLayout() {
  const headerMount = document.getElementById("header");
  const footerMount = document.getElementById("footer");

  if (!headerMount || !footerMount) {
    throw new Error("Every page must provide #header and #footer mount points.");
  }

  headerMount.innerHTML = `
    <a class="skip-link" href="#main-content" data-i18n="skip-link">Skip to main content</a>
    <header class="site-header">
      <div class="container header-layout">
        <a href="/index.html" class="brand" aria-label="AETHERA home">
          <img src="/assets/icons/logo.svg" alt="" class="logo" width="256" height="256">
          <span class="brand-text">
            <span class="brand-name">AETHERA</span>
            <span class="brand-tag" data-i18n="brand-tag">GREEK PREMIUM PRODUCTS</span>
          </span>
        </a>
        <div class="header-actions">
          <button
            class="nav-toggle"
            type="button"
            aria-controls="primary-navigation"
            aria-expanded="false"
            aria-label="Open navigation"
            data-i18n-aria-label="nav-toggle-open"
          >
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
          </button>
          <nav
            id="primary-navigation"
            class="main-nav"
            aria-label="Primary navigation"
            data-i18n-aria-label="nav-label"
          >
            <a href="/index.html" data-i18n="nav-home">Home</a>
            <a href="/products.html" data-i18n="nav-products">Products</a>
            <a href="/about.html" data-i18n="nav-about">Company</a>
            <a href="/contact.html" data-i18n="nav-contact">Wholesale enquiries</a>
          </nav>
          <div class="lang-dropdown">
            <button
              class="lang-toggle"
              type="button"
              aria-controls="language-menu"
              aria-haspopup="menu"
              aria-expanded="false"
              aria-label="Choose language"
              data-i18n-aria-label="language-toggle-label"
            >
              <span class="lang-flag" aria-hidden="true">EN</span>
              <span class="lang-label">English</span>
              <span class="lang-chevron" aria-hidden="true">⌄</span>
            </button>
            <div
              id="language-menu"
              class="lang-menu"
              role="menu"
              aria-label="Languages"
              data-i18n-aria-label="language-menu-label"
            >
              <button type="button" role="menuitemradio" aria-checked="true" data-lang="en">
                <span class="lang-flag" aria-hidden="true">EN</span>
                <span>English</span>
              </button>
              <button type="button" role="menuitemradio" aria-checked="false" data-lang="de">
                <span class="lang-flag" aria-hidden="true">DE</span>
                <span>Deutsch</span>
              </button>
              <button type="button" role="menuitemradio" aria-checked="false" data-lang="el">
                <span class="lang-flag" aria-hidden="true">EL</span>
                <span>Ελληνικά</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>`;

  footerMount.innerHTML = `
    <footer class="site-footer">
      <div class="container footer-layout">
        <p>© <span data-current-year></span> <span data-i18n="footer-copy">AETHERA. All rights reserved.</span></p>
        <nav class="footer-nav" aria-label="Legal" data-i18n-aria-label="footer-nav-label">
          <a href="/legal/privacy.html" data-i18n="footer-privacy">Privacy policy</a>
          <a href="/legal/terms.html" data-i18n="footer-terms">Terms of use</a>
        </nav>
      </div>
    </footer>`;

  footerMount.querySelector("[data-current-year]").textContent = String(new Date().getFullYear());

  const prefooterMount = document.getElementById("prefooter");
  if (prefooterMount) {
    prefooterMount.innerHTML = `
      <section class="cta" aria-labelledby="cta-title">
        <div class="container cta-layout">
          <div>
            <p class="eyebrow" data-i18n="home-cta-eyebrow">Wholesale partnerships</p>
            <h2 id="cta-title" data-i18n="home-cta-title">Let’s discuss your next order</h2>
            <p data-i18n="home-cta-text">Share your volumes, destination, and packaging needs. We will respond with the next practical steps.</p>
          </div>
          <div class="cta-actions">
            <a href="/contact.html" class="btn btn-primary" data-i18n="home-cta-btn">Contact the wholesale team</a>
            <p class="cta-note" data-i18n="home-cta-note">Wholesale and export enquiries only.</p>
          </div>
        </div>
      </section>`;
  }
}

function initializeNavigation() {
  const toggle = document.querySelector(".nav-toggle");
  const navigation = document.querySelector(".main-nav");

  if (!toggle || !navigation) {
    return;
  }

  function setNavigationOpen(isOpen, returnFocus = false) {
    navigation.classList.toggle("open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute(
      "data-i18n-aria-label",
      isOpen ? "nav-toggle-close" : "nav-toggle-open",
    );
    setTranslatedAttribute(
      toggle,
      "aria-label",
      isOpen ? "nav-toggle-close" : "nav-toggle-open",
      isOpen ? "Close navigation" : "Open navigation",
    );

    if (returnFocus) {
      toggle.focus();
    }
  }

  toggle.addEventListener("click", function () {
    setNavigationOpen(!navigation.classList.contains("open"));
  });

  navigation.querySelectorAll("a").forEach(function (link) {
    if (normalizedPath(link.href) === normalizedPath(window.location.href)) {
      link.setAttribute("aria-current", "page");
    }

    link.addEventListener("click", function () {
      setNavigationOpen(false);
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && navigation.classList.contains("open")) {
      setNavigationOpen(false, true);
    }
  });

  document.addEventListener("click", function (event) {
    if (
      navigation.classList.contains("open") &&
      event.target instanceof Node &&
      !navigation.contains(event.target) &&
      !toggle.contains(event.target)
    ) {
      setNavigationOpen(false);
    }
  });

  const desktopQuery = window.matchMedia("(min-width: 901px)");
  desktopQuery.addEventListener("change", function (event) {
    if (event.matches) {
      setNavigationOpen(false);
    }
  });
}

function initializeLanguageMenu() {
  const dropdown = document.querySelector(".lang-dropdown");
  const toggle = dropdown?.querySelector(".lang-toggle");
  const menu = dropdown?.querySelector(".lang-menu");
  const options = Array.from(dropdown?.querySelectorAll("[data-lang]") ?? []);

  if (!dropdown || !toggle || !menu || options.length === 0) {
    return;
  }

  function setMenuOpen(isOpen, focusTarget = "active") {
    dropdown.classList.toggle("open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));

    if (!isOpen) {
      return;
    }

    const option = focusTarget === "last"
      ? options.at(-1)
      : options.find(function (candidate) {
          return candidate.dataset.lang === activeLanguage;
        }) ?? options[0];
    window.setTimeout(function () {
      option.focus();
    }, 0);
  }

  toggle.addEventListener("click", function () {
    setMenuOpen(!dropdown.classList.contains("open"));
  });

  toggle.addEventListener("keydown", function (event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setMenuOpen(true, event.key === "ArrowUp" ? "last" : "active");
    }
  });

  options.forEach(function (button) {
    button.addEventListener("click", async function () {
      try {
        await setLanguage(button.dataset.lang);
      } catch (error) {
        console.error(`Language switch to ${button.dataset.lang} failed.`, error);
      } finally {
        setMenuOpen(false);
        toggle.focus();
      }
    });
  });

  menu.addEventListener("keydown", function (event) {
    const currentIndex = options.indexOf(document.activeElement);

    if (event.key === "Escape") {
      event.preventDefault();
      setMenuOpen(false);
      toggle.focus();
      return;
    }

    if (event.key === "Tab") {
      setMenuOpen(false);
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    let nextIndex;

    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = options.length - 1;
    } else {
      const direction = event.key === "ArrowDown" ? 1 : -1;
      nextIndex = (currentIndex + direction + options.length) % options.length;
    }

    options[nextIndex].focus();
  });

  document.addEventListener("click", function (event) {
    if (event.target instanceof Node && !dropdown.contains(event.target)) {
      setMenuOpen(false);
    }
  });

  syncLanguageMenu(activeLanguage);
}

async function setLanguage(language, options = {}) {
  const requestedLanguage = normalizeLanguage(language);
  const requestId = ++languageRequestId;
  const translations = await loadTranslations(requestedLanguage);

  // A slower earlier request must never overwrite a newer language choice.
  if (requestId !== languageRequestId) {
    return;
  }

  applyTranslations(translations);
  activeLanguage = requestedLanguage;
  document.documentElement.lang = requestedLanguage;
  syncLanguageMenu(requestedLanguage);

  if (options.persist !== false) {
    writeStoredLanguage(requestedLanguage);
  }

  window.dispatchEvent(new CustomEvent("aethera:languagechange", {
    detail: { language: requestedLanguage },
  }));
}

async function loadTranslations(language) {
  if (translationCache.has(language)) {
    return translationCache.get(language);
  }

  const response = await fetch(`/i18n/${language}.json`, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load ${language} translations: HTTP ${response.status}`);
  }

  const translations = await response.json();
  if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
    throw new TypeError(`${language} translations must be a JSON object.`);
  }

  translationCache.set(language, translations);
  return translations;
}

function applyTranslations(translations) {
  document.querySelectorAll("[data-i18n]").forEach(function (element) {
    const translation = translations[element.dataset.i18n];
    if (typeof translation === "string") {
      element.textContent = translation;
    }
  });

  document.querySelectorAll("[data-i18n-html]").forEach(function (element) {
    const translation = translations[element.dataset.i18nHtml];
    if (typeof translation === "string") {
      // Only repository-owned copy may use this explicit, limited-markup path.
      element.innerHTML = translation;
    }
  });

  applyTranslatedAttribute(translations, "data-i18n-placeholder", "placeholder");
  applyTranslatedAttribute(translations, "data-i18n-alt", "alt");
  applyTranslatedAttribute(translations, "data-i18n-content", "content");
  applyTranslatedAttribute(translations, "data-i18n-aria-label", "aria-label");
}

function applyTranslatedAttribute(translations, dataAttribute, attribute) {
  document.querySelectorAll(`[${dataAttribute}]`).forEach(function (element) {
    const key = element.getAttribute(dataAttribute);
    const translation = translations[key];
    if (typeof translation === "string") {
      element.setAttribute(attribute, translation);
    }
  });
}

function setTranslatedAttribute(element, attribute, key, fallback) {
  const translations = translationCache.get(activeLanguage);
  element.setAttribute(attribute, translations?.[key] ?? fallback);
}

function syncLanguageMenu(language) {
  const dropdown = document.querySelector(".lang-dropdown");
  const toggle = dropdown?.querySelector(".lang-toggle");

  if (!dropdown || !toggle) {
    return;
  }

  toggle.querySelector(".lang-flag").textContent = language.toUpperCase();
  toggle.querySelector(".lang-label").textContent = LANGUAGE_LABELS[language];

  dropdown.querySelectorAll("[data-lang]").forEach(function (button) {
    const isActive = button.dataset.lang === language;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-checked", String(isActive));
  });
}

function normalizedPath(url) {
  const path = new URL(url, window.location.origin).pathname.replace(/\/$/, "/index.html");
  return path.toLowerCase();
}

function normalizeLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}

function readStoredLanguage() {
  try {
    const storedValue = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (SUPPORTED_LANGUAGES.includes(storedValue)) {
      return storedValue;
    }

    // Preserve preferences written by the earlier JSON-encoded implementation.
    return normalizeLanguage(JSON.parse(storedValue));
  } catch (error) {
    console.warn("Stored language could not be read.", error);
    return DEFAULT_LANGUAGE;
  }
}

function writeStoredLanguage(language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizeLanguage(language));
  } catch (error) {
    console.warn("Language preference could not be saved.", error);
  }
}
