const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise;

export async function createTurnstileController({
  container,
  language,
  onTokenChange,
  onUnavailable,
  siteKey,
}) {
  const turnstile = await loadTurnstile();
  let currentLanguage = language;
  let currentSize = getWidgetSize(container);
  let widgetId = renderWidget(language);
  let resizeTimeoutId = null;
  globalThis.addEventListener("resize", scheduleResize, { passive: true });

  return Object.freeze({
    remove() {
      globalThis.removeEventListener("resize", scheduleResize);
      if (resizeTimeoutId !== null) {
        globalThis.clearTimeout(resizeTimeoutId);
      }
      if (widgetId !== null) {
        turnstile.remove(widgetId);
        widgetId = null;
      }
      onTokenChange("");
    },
    renderForLanguage(nextLanguage) {
      currentLanguage = nextLanguage;
      if (widgetId !== null) {
        turnstile.remove(widgetId);
      }
      onTokenChange("");
      widgetId = renderWidget(currentLanguage);
    },
    reset() {
      onTokenChange("");
      if (widgetId !== null) {
        turnstile.reset(widgetId);
      }
    },
  });

  function renderWidget(widgetLanguage) {
    return turnstile.render(container, {
      action: "enquiry",
      appearance: "always",
      callback(token) {
        onTokenChange(typeof token === "string" ? token : "");
      },
      "error-callback"() {
        onTokenChange("");
        onUnavailable();
      },
      "expired-callback"() {
        onTokenChange("");
      },
      language: normalizeLanguage(widgetLanguage),
      sitekey: siteKey,
      size: currentSize,
      theme: "light",
    });
  }

  function handleResize() {
    resizeTimeoutId = null;
    const nextSize = getWidgetSize(container);
    if (nextSize === currentSize) {
      return;
    }

    currentSize = nextSize;
    if (widgetId !== null) {
      turnstile.remove(widgetId);
    }
    onTokenChange("");
    widgetId = renderWidget(currentLanguage);
  }

  function scheduleResize() {
    if (resizeTimeoutId !== null) {
      globalThis.clearTimeout(resizeTimeoutId);
    }
    resizeTimeoutId = globalThis.setTimeout(handleResize, 150);
  }
}

function loadTurnstile() {
  if (globalThis.turnstile) {
    return Promise.resolve(globalThis.turnstile);
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeoutId = globalThis.setTimeout(() => {
      reject(new Error("Turnstile script timed out."));
    }, 10_000);

    script.defer = true;
    script.src = TURNSTILE_SCRIPT_URL;
    script.addEventListener("load", () => {
      globalThis.clearTimeout(timeoutId);
      if (globalThis.turnstile) {
        resolve(globalThis.turnstile);
      } else {
        reject(new Error("Turnstile API was unavailable after loading."));
      }
    }, { once: true });
    script.addEventListener("error", () => {
      globalThis.clearTimeout(timeoutId);
      reject(new Error("Turnstile script failed to load."));
    }, { once: true });
    document.head.append(script);
  });

  return scriptPromise;
}

function normalizeLanguage(language) {
  return ["en", "de", "el"].includes(language) ? language : "auto";
}

function getWidgetSize(container) {
  return container.getBoundingClientRect().width < 300 ? "compact" : "flexible";
}
