# AETHERA Website

Official multilingual website for AETHERA, a Greek premium-products business
from Kos Island. The production target is `https://www.aethera.gr`.

The public site remains package-free: plain HTML, one CSS file, vanilla
JavaScript modules, and JSON translation dictionaries are deployed directly to
Netlify without a frontend build. Wholesale enquiries are sent to a public
Supabase Edge Function, checked by Cloudflare Turnstile and distributed Upstash
rate limits, then delivered by Resend. The application does not create an
enquiry database or persist enquiry payloads itself.

## Architecture

```text
Browser on Netlify
  -> client validation + Turnstile
  -> Supabase Edge Function
       -> strict server validation
       -> Upstash short/long rate limits
       -> Turnstile server verification
       -> Resend email
  -> localized success or error feedback
```

Private credentials exist only as Supabase function secrets. The Turnstile
site key and Edge Function URL in `assets/js/enquiry/config.mjs` are public
browser configuration.

## Project structure

```text
aethera-website/
  contact.html
  assets/
    css/style.css
    js/
      site.js
      enquiry/
  i18n/
  legal/
  supabase/
    config.toml
    functions/send-enquiry/
  tools/
    validate-site.mjs
    test-enquiry-frontend.mjs
  docs/
    ENQUIRY_DEPLOYMENT.md
  netlify.toml
  .env.example
```

## Run the static site locally

Translation files and JavaScript modules use HTTP and root-relative paths, so
do not open the HTML files with `file://`.

```powershell
python -m http.server 8000
```

Open `http://localhost:8000/`. The local public form configuration points to
Supabase on `http://127.0.0.1:54321` and uses Cloudflare's visible always-pass
test site key. A complete local submission also requires the function setup in
[the enquiry deployment guide](docs/ENQUIRY_DEPLOYMENT.md).

## Quality checks

The frontend has no install or build step. Node.js is used only for checks:

```powershell
node --check assets/js/site.js
Get-ChildItem assets/js/enquiry/*.mjs | ForEach-Object { node --check $_.FullName }
node --test tools/test-enquiry-frontend.mjs
node --check tools/validate-site.mjs
node tools/validate-site.mjs
git diff --check
```

Run the Edge Function checks from its directory with Deno:

```powershell
Set-Location supabase/functions/send-enquiry
deno task check
deno task lint
deno task test
```

The Edge Function tests mock Turnstile, Upstash, and Resend. They do not send
real email. Before release, also complete the browser and safe staging checks
in [the release process](docs/RELEASE_PROCESS.md).

## Hosting

Netlify publishes the repository root with no build command. Keep the Netlify
dashboard build command empty. `netlify.toml` defines the site's security and
cache headers; replace its placeholder Supabase CSP origin with the exact
project origin before deployment.

The function is deployed independently to Supabase. Full account setup,
secrets, sender verification, CORS, CSP, logs, key rotation, limitations, and a
deployment checklist are documented in
[docs/ENQUIRY_DEPLOYMENT.md](docs/ENQUIRY_DEPLOYMENT.md).

## Branch workflow

- `develop` — active development.
- `staging` — release candidate and final QA.
- `production` — live website branch.
- `main` — approved stable milestones.
- `feature/*`, `fix/*`, and `hotfix/*` — isolated work.

Normal release flow:

```text
feature/* or fix/* -> develop -> staging -> production -> main
```

Only promote a tested staging commit to `production`. See the detailed
[release process](docs/RELEASE_PROCESS.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Enquiry deployment and operations](docs/ENQUIRY_DEPLOYMENT.md)
- [Release process](docs/RELEASE_PROCESS.md)
- [Project review notes](docs/PROJECT_REVIEW.md)
- [Reusable chat roles](docs/CHAT_AGENTS.md)

## Rights

Copyright © 2026 AETHERA. All rights reserved.
