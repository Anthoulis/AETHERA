/**
 * Lightweight wrapper around localStorage with namespacing.
 * Stores JSON values and safely falls back without breaking the app.
 */
export class StorageService {
  /**
   * @param {string} prefix namespace to avoid key collisions across the site
   */
  constructor(prefix = "aethera") {
    this.prefix = prefix;
  }

  /**
   * Read a value from storage.
   * @param {string} key logical key (will be prefixed internally)
   * @param {*} fallback value to return if missing or parse fails
   * @returns {*} parsed value or fallback
   */
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(`${this.prefix}:${key}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn("StorageService:get", err);
      return fallback;
    }
  }

  /**
   * Persist a value in storage.
   * @param {string} key logical key (will be prefixed internally)
   * @param {*} value any JSON-serializable value
   */
  set(key, value) {
    try {
      localStorage.setItem(`${this.prefix}:${key}`, JSON.stringify(value));
    } catch (err) {
      console.warn("StorageService:set", err);
    }
  }
}
