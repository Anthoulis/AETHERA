const translations = {
  en: {
    "brand-tag": "GREEK PREMIUM HONEY",
    "nav-home": "Home",
    "nav-products": "Products",
    "nav-about": "Company",
    "nav-contact": "Wholesale Enquiries",
    "footer-copy": "&copy; 2025 AETHERA. All rights reserved.",
    "footer-privacy": "Privacy Policy",
    "footer-terms": "Terms & Conditions"
  },
  de: {
    "brand-tag": "GRIECHISCHER PREMIUM HONIG",
    "nav-home": "Startseite",
    "nav-products": "Produkte",
    "nav-about": "Unternehmen",
    "nav-contact": "Großhandelsanfragen",
    "footer-copy": "&copy; 2025 AETHERA. Alle Rechte vorbehalten.",
    "footer-privacy": "Datenschutz",
    "footer-terms": "AGB"
  },
  el: {
    "brand-tag": "ΕΛΛΗΝΙΚΟ ΠΟΙΟΤΙΚΟ ΜΕΛΙ",
    "nav-home": "Αρχική",
    "nav-products": "Προϊόντα",
    "nav-about": "Εταιρεία",
    "nav-contact": "Επικοινωνία Χονδρικής",
    "footer-copy": "&copy; 2025 AETHERA. Όλα τα δικαιώματα κατοχυρωμένα.",
    "footer-privacy": "Πολιτική Απορρήτου",
    "footer-terms": "Όροι Χρήσης"
  }
};

const LANG_KEY = "site-lang";
const defaultLang = "en";
const dropdown = document.querySelector(".lang-dropdown");
const toggle = dropdown ? dropdown.querySelector(".lang-toggle") : null;
const menuButtons = dropdown ? Array.from(dropdown.querySelectorAll(".lang-menu button")) : [];
const langLabels = { en: "English", de: "Deutsch", el: "Ελληνικά" };

function setLang(lang) {
  const dict = translations[lang] || translations[defaultLang];
  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach(node => {
    const key = node.getAttribute("data-i18n");
    if (dict[key]) {
      node.innerHTML = dict[key];
    }
  });

  menuButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.lang === lang));
  if (toggle) {
    const current = menuButtons.find(btn => btn.dataset.lang === lang);
    if (current) {
      const flag = current.dataset.flag || "EN";
      toggle.querySelector(".lang-flag").textContent = flag;
      toggle.querySelector(".lang-label").textContent = langLabels[lang] || langLabels[defaultLang];
    }
  }

  localStorage.setItem(LANG_KEY, lang);
}

function initLang() {
  if (!dropdown || !toggle || !menuButtons.length) return;
  const saved = localStorage.getItem(LANG_KEY) || defaultLang;
  setLang(saved);

  toggle.addEventListener("click", () => {
    const open = dropdown.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  menuButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      setLang(btn.dataset.lang);
      dropdown.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });

  document.addEventListener("click", event => {
    if (!dropdown.contains(event.target)) {
      dropdown.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

initLang();
