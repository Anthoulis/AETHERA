const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOCAL_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";

// These public values are intentionally committed. Replace both placeholders
// during deployment; private provider credentials belong only in Supabase.
const PRODUCTION_FUNCTION_URL =
  "https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/send-enquiry";
const PRODUCTION_TURNSTILE_SITE_KEY = "YOUR_TURNSTILE_SITE_KEY";

export function getEnquiryPublicConfig(location) {
  const isLocal = LOCAL_HOSTNAMES.has(location.hostname);

  return Object.freeze({
    functionUrl: isLocal
      ? "http://127.0.0.1:54321/functions/v1/send-enquiry"
      : PRODUCTION_FUNCTION_URL,
    requestTimeoutMs: 15_000,
    turnstileSiteKey: isLocal
      ? LOCAL_TURNSTILE_SITE_KEY
      : PRODUCTION_TURNSTILE_SITE_KEY,
  });
}

export function isEnquiryPublicConfigReady(config) {
  try {
    const endpoint = new URL(config.functionUrl);
    const isLocal = LOCAL_HOSTNAMES.has(endpoint.hostname);
    const isSecure = endpoint.protocol === "https:" || isLocal;

    return isSecure &&
      !config.functionUrl.includes("YOUR_SUPABASE_PROJECT_REF") &&
      !config.turnstileSiteKey.includes("YOUR_TURNSTILE_SITE_KEY");
  } catch {
    return false;
  }
}
