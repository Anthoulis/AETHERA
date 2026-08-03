# Architecture

AETHERA keeps a package-free static frontend. Public pages are ordinary HTML,
visual styling lives in one CSS file, shared browser behavior lives in a small
deferred vanilla JavaScript file, and translations are loaded from flat JSON
dictionaries. The wholesale form alone calls an isolated TypeScript Supabase
Edge Function; it does not add a frontend compilation step or application
database.

## Runtime flow

1. Each page provides English fallback content and the `#header` and `#footer`
   mount points.
2. `assets/js/site.js` renders the shared header, footer, and optional prefooter.
3. It initializes responsive navigation, current-page state, and the
   keyboard-ready language menu.
4. It loads the saved language dictionary and applies translations to text and
   explicitly supported attributes.
5. If a saved translation cannot load, English remains usable and is retried as
   the fallback dictionary.

The saved language is the only first-party browser preference. It is stored in
`localStorage` under `aethera:lang`.

## Responsibilities

HTML owns semantic page structure, fallback copy, page metadata, and page-only
content. Every page has one `#main-content` landmark so the shared skip link has
a stable destination.

`assets/css/style.css` owns the complete visual system and responsive behavior.
It uses system fonts, so page rendering does not depend on a font CDN.

`assets/js/site.js` owns only shared markup and browser interactions. Do not add
page-content renderers or application-style state management to it.

`assets/js/enquiry/` owns contact-only validation, public configuration,
Turnstile rendering, API transport, and form state. These modules do not contain
private credentials. `supabase/functions/send-enquiry/` owns the independent
server trust boundary and provider integrations.

## Internationalization

Translations live in `i18n/en.json`, `i18n/de.json`, and `i18n/el.json`. English
is the reference dictionary, and all three files must have identical key sets.

- `data-i18n` replaces text safely with `textContent`.
- `data-i18n-html` is the explicit exception for repository-controlled copy
  that needs only `<strong>` or `<br>`.
- `data-i18n-placeholder`, `data-i18n-alt`, `data-i18n-content`, and
  `data-i18n-aria-label` translate their corresponding attributes.

Never route user-submitted or remotely supplied content through
`data-i18n-html`. `tools/validate-site.mjs` rejects other translation markup,
missing keys, and unused keys.

## Contact form

`contact.html` preserves the existing native controls and stable, language-
independent option values. Its page-specific controller prevents normal form
navigation, validates for immediate inline feedback, obtains a Turnstile token,
guards against duplicate clicks, and sends JSON over HTTPS. It clears the form
only after the server confirms success and exposes localized loading, success,
and failure states through an `aria-live` region.

The Supabase Edge Function is the authoritative boundary. It restricts method,
content type, body size, and exact origins; applies distributed short- and
long-window rate limits; rejects the honeypot and implausibly fast submissions;
validates every request field; verifies Turnstile server-side; and asks Resend
to deliver a separately escaped text and HTML email. Provider calls use timeouts
and public responses never include provider or configuration details.

Upstash contains only HMAC-derived request identifiers and expiring counters.
No enquiry body is written to an AETHERA database. Resend and the recipient
mailbox necessarily process and retain the delivered message; see the privacy
policy and deployment guide for the precise limitation.

## Assets and paths

Runtime paths are root-relative so the same shared markup works from both root
and nested legal pages. The original `assets/images/hero.jpg` is retained as a
source master; only `hero-optimized.jpg` is referenced at runtime.

Do not add assets without a real page reference. The validator flags orphaned
runtime assets and images above the current one-megabyte runtime budget.

## Hosting and security

`netlify.toml` publishes the repository root without a build command. It defines
a restrictive Content Security Policy, anti-framing headers, a conservative
permissions policy, and cache rules. Netlify automatically uses the root
`404.html` for unresolved paths. The CSP permits the exact Supabase function
origin for browser requests and Cloudflare's Turnstile script/frame origin;
Resend and Upstash remain server-only and are absent from browser policy.

## Maintenance rules

- Preserve the package-free architecture unless a demonstrated requirement
  cannot be met cleanly with static files.
- Keep English fallback copy aligned with the English dictionary.
- Add every new translation key to all three dictionaries in the same change.
- Delete unused code and assets after checking dynamic references.
- Keep comments for non-obvious intent, security boundaries, or ordering rules.
- Run the zero-dependency validator and browser QA after behavior changes.
- Update operational documentation when runtime, hosting, or release behavior
  changes.
