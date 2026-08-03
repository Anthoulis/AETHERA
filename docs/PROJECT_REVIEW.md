# Project review notes

Last updated: 2026-08-03

This file records durable maintenance findings that should not become comments
inside the source.

## Current baseline

- The frontend is a package-free static project: seven HTML pages, one CSS
  file, small vanilla JavaScript modules, and three matching translation
  dictionaries.
- Every page has a main landmark, translated metadata, shared navigation, and
  an explicit fallback experience.
- Translation text is inserted safely by default. Limited trusted markup is
  allowed only through `data-i18n-html` and is checked by the validator.
- Runtime photography is compressed below one megabyte per file. The original
  hero is retained only as an unreferenced source master.
- The contact form has stable submission values, matching browser/server
  validation, accessible localized feedback, Turnstile, duplicate-submit
  protection, a honeypot, timing checks, and distributed rate limits.
- The isolated Supabase Edge Function sends email through Resend and writes no
  enquiry payload to an application database.
- Netlify configuration defines static publishing, error handling, security
  headers, and cache behavior without adding a build system.
- `tools/validate-site.mjs` checks page structure, local references, intrinsic
  image dimensions, translation parity, translation markup, asset usage, image
  budgets, and required production files.

## External dependencies

- Netlify hosts the frontend; Supabase runs the Edge Function; Cloudflare
  Turnstile verifies browser challenges; Upstash holds expiring pseudonymous
  rate-limit counters; Resend sends the email; and the recipient email provider
  stores the delivered message.
- The frontend has no package dependencies, analytics scripts, advertising
  trackers, or third-party fonts. Backend provider calls use direct HTTPS with
  no runtime dependency packages.
- Resend normally retains email content for 30 days. Avoid claiming that form
  contents are never stored unless an eligible Resend no-content-storage option
  is active and the recipient mailbox's retention is addressed as well.

## Owner verification gates

These facts cannot be proved from repository code and must be confirmed before
production publication:

1. Legal controller identity and any postal/company details that should appear
   in the privacy policy or terms.
2. Actual AETHERA correspondence retention, provider contracts and safeguards,
   and whether Resend's eligible no-content-storage option will be purchased.
3. Product claims including family roots since 1934, seasonal capacity,
   available formats, lead times, laboratory documents, Incoterms, and
   multilingual labelling.
4. Supabase ownership/region, Resend domain verification and recipient,
   Turnstile hostname restrictions, Upstash region, key rotation ownership,
   and one successful staging email.
5. The final canonical production host (`https://www.aethera.gr`), exact
   Supabase project origin in CSP/CORS, and Netlify dashboard settings.

The legal pages are a code-aligned operational baseline, not a substitute for
review by a qualified adviser who knows the business entity and processing
operations.

## Future improvements only when justified

- Add responsive image variants if measured mobile traffic shows a material
  bandwidth benefit beyond the current compressed assets.
- Add a persistent browser end-to-end suite only if release frequency justifies
  the toolchain. The current Node/Deno tests plus manual staging browser QA keep
  production dependencies at zero.
- Revisit cache durations if asset filenames become content-hashed.
