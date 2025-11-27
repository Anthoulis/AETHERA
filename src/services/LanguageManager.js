import { fetchJson } from "../utils/fetchJson.js";

/**
 * Loads language dictionaries from /i18n/*.json and applies them to the DOM.
 * Responsible for: caching, persisting selection, and updating text/placeholder nodes.
 */
export class LanguageManager {
  constructor({ storage, defaultLang = "en", i18nPath = "/i18n" }) {
    this.storage = storage;
    this.defaultLang = defaultLang;
    this.i18nPath = i18nPath;
    this.current = storage.get("lang", defaultLang);
    this.cache = new Map();
  }

  /**
   * Fetch and cache a dictionary for the given language.
   * @param {string} lang language code, e.g., "en"
   * @returns {Promise<Object>} translation dictionary
   */
  async load(lang = this.current) {
    if (this.cache.has(lang)) return this.cache.get(lang);
    const data = await fetchJson(`${this.i18nPath}/${lang}.json`);
    this.cache.set(lang, data);
    return data;
  }

  /**
   * Apply translations to the DOM and persist the chosen language.
   * Translates both text content (data-i18n) and placeholders (data-i18n-placeholder).
   * @param {string} lang language code
   */
  async apply(lang = this.current) {
    const dict = await this.load(lang);
    this.current = lang;
    document.documentElement.lang = lang;
    this.storage.set("lang", lang);

    document.querySelectorAll("[data-i18n]").forEach(node => {
      const key = node.getAttribute("data-i18n");
      if (dict[key]) node.innerHTML = dict[key];
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(node => {
      const key = node.getAttribute("data-i18n-placeholder");
      if (dict[key]) node.setAttribute("placeholder", dict[key]);
    });
  }
}
