# Enquiry deployment and operations

This guide covers the wholesale form only. The frontend remains a static
Netlify deployment; `send-enquiry` is a public Supabase Edge Function that
validates requests, rate-limits abuse, verifies Cloudflare Turnstile, and sends
one email through Resend. It does not use Supabase Auth, Postgres, Storage,
Netlify Forms, or Netlify Functions.

## Trust boundaries

- Browser validation exists for feedback only and is never authoritative.
- The Edge Function accepts only exact configured origins, JSON `POST`
  requests, and bodies up to 16 KiB. It validates every field again.
- Upstash stores HMAC-derived client identifiers and expiring counters only.
  It never receives the form contents.
- Turnstile receives the challenge token, expected hostname/action, and request
  address for server verification.
- Resend receives the formatted enquiry and delivers it to the configured
  mailbox. Private credentials exist only in Supabase secrets.
- A shared browser `submissionId` becomes the Resend idempotency key, reducing
  duplicate delivery when the same request is retried.

## Required accounts and software

Accounts:

1. A Supabase project for the Edge Function. No database tables are needed.
2. A Resend account with an authenticated AETHERA sending domain.
3. A Cloudflare Turnstile widget for the production and fixed staging hosts.
4. An Upstash Redis database for distributed rate-limit counters.
5. The existing Netlify site and DNS access for `aethera.gr`.

Local tools:

- Node.js for the static validator and frontend tests.
- Deno 2.x for Edge Function check, lint, and unit tests.
- Supabase CLI for local serving, secrets, and deployment.
- Docker Desktop or another Docker-compatible runtime for local Supabase.
- Python or another static HTTP server for the frontend.

Verify the tools before starting:

```powershell
node --version
deno --version
supabase --version
docker version
python --version
```

These tools are development dependencies only. Do not add a `package.json` or
ship them with the static site.

## Configuration values

Copy `.env.example` to an ignored file for each environment:

```powershell
Copy-Item .env.example .env.local
Copy-Item .env.example .env.production
```

Never commit either copied file. Configure all values:

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Private Resend key with permission to send email. |
| `ENQUIRY_RECIPIENT_EMAIL` | Fixed mailbox that receives enquiries. |
| `ENQUIRY_FROM_EMAIL` | Fixed sender on the verified Resend domain. |
| `TURNSTILE_SECRET_KEY` | Private Turnstile server-verification secret. |
| `ALLOWED_ORIGINS` | Comma-separated exact browser origins; no paths, wildcards, or trailing slashes. |
| `UPSTASH_REDIS_REST_URL` | Private Upstash Redis HTTPS REST endpoint. |
| `UPSTASH_REDIS_REST_TOKEN` | Private Upstash REST token. |
| `RATE_LIMIT_IP_SALT` | Random secret of at least 32 characters for HMAC identifiers. |

Generate a strong rate-limit salt without reusing another credential:

```powershell
$rateLimitBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rateLimitBytes)
[BitConverter]::ToString($rateLimitBytes).Replace('-', '').ToLowerInvariant()
```

For production, use only hosts that actually serve the form, for example:

```dotenv
ALLOWED_ORIGINS=https://www.aethera.gr,https://staging.aethera.gr
```

Add `https://aethera.gr` only if Netlify serves a page from that origin instead
of immediately redirecting it. Use a fixed staging origin; deploy-preview URLs
are intentionally not accepted by a wildcard.

## Provider setup

### Resend

1. Add a dedicated sending subdomain such as `mail.aethera.gr` in Resend.
2. Add the exact SPF and DKIM records shown by Resend to the DNS provider.
3. Wait until Resend marks the domain verified.
4. Create a restricted API key and place it only in the function environment.
5. Set `ENQUIRY_FROM_EMAIL` to a sender on that domain, for example
   `AETHERA <enquiries@mail.aethera.gr>`.
6. Set `ENQUIRY_RECIPIENT_EMAIL` to the controlled AETHERA mailbox.

The visitor's validated email is used only as `Reply-To`, never as `From`.
Normal Resend operation retains email data for 30 days. Its no-content-storage
option is separately priced and eligibility-limited; the recipient mailbox
also retains the delivered email. AETHERA therefore has no application enquiry
database, but must not claim that no provider stores the message.

### Cloudflare Turnstile

1. Create a managed Turnstile widget.
2. Restrict it to `www.aethera.gr` and the fixed staging hostname. Do not add
   `localhost` to the production widget.
3. Replace `YOUR_TURNSTILE_SITE_KEY` in
   `assets/js/enquiry/config.mjs` with the public site key.
4. Put the private secret in `TURNSTILE_SECRET_KEY` only.

The form renders Turnstile explicitly with action `enquiry`. The function
checks success, hostname, and action. Tokens expire after five minutes and are
single-use, so the widget is reset after every attempted send.

For local development, the committed browser configuration uses Cloudflare's
visible always-pass test site key. Put Cloudflare's matching always-pass test
secret in `.env.local`:

```dotenv
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

Never use test keys in production.

### Upstash

1. Create one Redis database in a region appropriate for the Supabase function.
2. Copy its HTTPS REST URL and REST token into the private environment.
3. Do not enable request-body analytics that would capture application data.

One atomic Redis script increments both limits: five attempts per rolling-from-
first-use 10-minute window and 20 per 24-hour window. A failure or timeout in
Upstash fails closed, so an infrastructure outage cannot bypass the limiter.

## Local development

Automated provider tests require no accounts, secrets, Docker, or network:

```powershell
node --test tools/test-enquiry-frontend.mjs
Set-Location supabase/functions/send-enquiry
deno task check
deno task lint
deno task test
Set-Location ../../..
node tools/validate-site.mjs
```

To run the complete form locally, fill `.env.local` with the Turnstile test
secret plus working test credentials for Resend and Upstash. Use a controlled
recipient mailbox. Then open two terminals from the repository root.

Terminal 1:

```powershell
supabase start
supabase functions serve send-enquiry --env-file .env.local
```

Terminal 2:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000/contact.html`. `.env.example` already documents the
matching local origin. Keep the form open for at least three seconds before
submitting because the server rejects unrealistically fast submissions.

Stop local Supabase after testing:

```powershell
supabase stop
```

## Supabase deployment

Create the Supabase project in the dashboard, then link this repository:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set --env-file .env.production
supabase secrets list
supabase functions deploy send-enquiry
```

`supabase/config.toml` sets `verify_jwt = false` because this is intentionally a
public web form. Do not add a Supabase publishable, anonymous, service-role, or
JWT key to the frontend. The application protections are exact CORS/origin
checks, body and field validation, Turnstile, the honeypot/timing checks, and
distributed rate limiting.

The deployed endpoint is:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-enquiry
```

Replace `YOUR_SUPABASE_PROJECT_REF` in
`assets/js/enquiry/config.mjs`. In `netlify.toml`, replace
`https://your-project-ref.supabase.co` with that same exact origin. Do not use a
Supabase wildcard. Resend and Upstash must not appear in the frontend CSP.

## Netlify and DNS

- Keep the publish directory as the repository root and the build command
  empty. There is no frontend build.
- Deploy the updated `netlify.toml` and verify the effective response CSP with
  the browser network panel or `curl.exe -I`.
- Confirm `script-src` and `frame-src` allow only Cloudflare's Turnstile origin,
  and `connect-src` allows only self plus the exact Supabase project origin.
- Keep existing Netlify DNS for the website.
- Add Resend's SPF and DKIM records exactly as provided. A Supabase custom
  domain is optional; no other DNS change is required.
- If a fixed staging site submits the form, add its exact origin to both the
  production secret and the Turnstile widget hostname list.

## Safe verification

Tests mock all external requests and never send email. After they pass, set a
controlled staging recipient and send one clearly labelled staging enquiry in
the browser. Confirm:

- exactly one message arrives after rapid repeated clicking;
- `From` is the authenticated AETHERA sender;
- `Reply-To` is the submitted customer address;
- subject, plain text, HTML layout, timestamp, and every field are correct;
- HTML-like input is displayed as text and does not become markup;
- the success message is visible, localized, announced, and the form clears;
- a simulated or temporary failure leaves the entered values intact.

Direct probes can safely verify rejection without producing email. Replace the
endpoint if testing production:

```powershell
$functionUrl = "http://127.0.0.1:54321/functions/v1/send-enquiry"
curl.exe -i $functionUrl -H "Origin: http://localhost:8000"
curl.exe -i -X POST $functionUrl -H "Origin: http://localhost:8000" -H "Content-Type: text/plain" --data "{}"
curl.exe -i -X POST $functionUrl -H "Origin: http://localhost:8000" -H "Content-Type: application/json" --data "{invalid"
curl.exe -i -X POST $functionUrl -H "Origin: https://not-aethera.example" -H "Content-Type: application/json" --data "{}"
```

Expected statuses are 405, 415, 400, and 403 respectively. Do not automate a
valid production send or reuse a Turnstile token.

## Logs and incident operations

For production, open Supabase Dashboard -> Edge Functions -> `send-enquiry` and
inspect **Invocations** for status/duration and **Logs** for platform events or
uncaught exceptions. Local function output appears in the serving terminal.
The function deliberately avoids logging enquiry fields, raw client addresses,
provider responses, and secrets.

To change the recipient, update only `ENQUIRY_RECIPIENT_EMAIL` in the private
environment and run:

```powershell
supabase secrets set --env-file .env.production
```

Test one controlled enquiry after any configuration change.

If a key is compromised, create its replacement at the provider first, update
the matching Supabase secret, verify the function, and then revoke the old key.
Rotate the public Turnstile site key by updating the frontend configuration and
deploying Netlify at the same time as its matching secret. Rotating
`RATE_LIMIT_IP_SALT` safely abandons current counters; the old pseudonymous keys
expire within 24 hours. Never print a secret or paste it into an issue, commit,
browser console, URL, or log message.

## Known limitations

- CORS and `Origin` checks reduce browser abuse but are not authentication.
- Turnstile, the honeypot, and the three-second timing rule reduce automated
  abuse; none proves that a visitor is legitimate.
- Limits are per HMAC-derived request address. People behind a shared NAT may
  share a limit, while distributed attackers can use many addresses.
- The function uses the first syntactically valid address in
  `X-Forwarded-For`. Before production launch, verify from Supabase request logs
  or support documentation that the hosted gateway replaces or sanitizes this
  header; otherwise a direct client could evade address-based limits by forging
  it. If that guarantee is unavailable, put the function behind a trusted proxy
  that overwrites the header before relying on per-address limits.
- The Redis counters use fixed windows anchored at the first attempt, so bursts
  can occur near a window boundary.
- Rate limiting happens after a Supabase invocation begins. It controls email
  abuse, not volumetric DDoS; Netlify, Supabase, and Cloudflare protections must
  handle network-level attacks.
- The function fails closed if rate limiting or bot verification is unavailable,
  which protects the mailbox but temporarily prevents valid submissions.
- Resend idempotency reduces duplicate accepted sends for 24 hours but cannot
  guarantee downstream mailbox delivery, nor can the form recover a message
  after every possible provider failure.
- Resend and the recipient mailbox retain the delivered content as described
  above. The no-database design is not a no-storage guarantee.

## Deployment checklist

- [ ] Node and Deno checks, lint, unit tests, site validation, and diff check pass.
- [ ] Resend sending domain is verified and a controlled recipient is configured.
- [ ] Production Turnstile widget contains only the real production/staging hosts.
- [ ] Upstash REST credentials and a unique rate-limit salt are configured.
- [ ] `ALLOWED_ORIGINS` contains exact HTTPS origins and no wildcard.
- [ ] The deployed Supabase gateway is confirmed to overwrite or sanitize the
  first `X-Forwarded-For` value, or a trusted proxy does so.
- [ ] All private values are set with Supabase secrets and absent from frontend files.
- [ ] The function is deployed and invalid direct probes return expected statuses.
- [ ] Public function URL and Turnstile site key replace both frontend placeholders.
- [ ] Netlify CSP contains the exact Supabase origin and Cloudflare Turnstile origins.
- [ ] Netlify still has an empty build command and publishes the repository root.
- [ ] Desktop, 320 px, 900 px, keyboard, and all three languages are verified.
- [ ] One controlled staging enquiry produces exactly one correct email and success state.
- [ ] Privacy copy, provider contracts, retention, and business identity are owner-reviewed.
- [ ] Supabase logs show no payloads, raw addresses, credentials, or provider details.

## Provider references

- [Supabase Edge Function quickstart](https://supabase.com/docs/guides/functions/quickstart)
- [Supabase function configuration](https://supabase.com/docs/guides/functions/function-configuration)
- [Supabase secrets](https://supabase.com/docs/guides/functions/secrets)
- [Supabase function logs](https://supabase.com/docs/guides/functions/logging)
- [Cloudflare Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Cloudflare Turnstile test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
- [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend content storage](https://resend.com/docs/knowledge-base/how-do-i-ensure-sensitive-data-isnt-stored-on-resend)
- [Upstash REST API](https://upstash.com/docs/redis/features/restapi)
