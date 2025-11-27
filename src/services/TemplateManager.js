/**
 * Minimal template registry to centralize creation of reusable UI fragments.
 * Components can register factories; controllers ask for named templates.
 */
export class TemplateManager {
  constructor() {
    this.registry = new Map();
  }

  /**
   * Register a template factory under a name.
   * @param {string} name unique template id
   * @param {Function} factory function that returns a Node or HTML string
   */
  register(name, factory) {
    this.registry.set(name, factory);
  }

  /**
   * Build a template instance by name.
   * @param {string} name template id
   * @param {Object} props optional props passed to factory
   * @returns {*} Node or string
   */
  create(name, props) {
    const factory = this.registry.get(name);
    if (!factory) throw new Error(`Template not registered: ${name}`);
    return factory(props);
  }
}
