# Release process

The project uses environment-oriented branches.

## Branches

- `develop` — active work for the next version.
- `staging` — release candidate used for final testing.
- `production` — live website branch for `www.aethera.gr`.
- `main` — approved stable milestones.
- `feature/*`, `fix/*`, and `hotfix/*` — isolated work.

## Normal release

```text
feature/* or fix/* -> develop -> staging -> production -> main
```

1. Build and verify changes on `develop` or a branch created from it.
2. Merge the completed work into `develop`.
3. Promote the exact verified commit to `staging`.
4. Test the deployed staging site with the checklist below.
5. Promote that same commit to `production` after explicit approval.
6. Promote `production` to `main` only for an approved stable milestone.

## Hotfix release

```text
production -> hotfix/* -> production
                         -> develop
                         -> staging
```

Branch from `production`, make the smallest safe fix, verify it, promote it to
production with explicit approval, and merge the same fix back to `develop` and
`staging`. Avoid history rewrites on environment branches.

## Local checks

Run from the repository root:

```powershell
node --check assets/js/site.js
Get-ChildItem assets/js/enquiry/*.mjs | ForEach-Object { node --check $_.FullName }
node --test tools/test-enquiry-frontend.mjs
node --check tools/validate-site.mjs
node tools/validate-site.mjs
git diff --check
```

Then run `deno task check`, `deno task lint`, and `deno task test` from
`supabase/functions/send-enquiry`.

Serve the site over HTTP for browser testing; do not rely on `file://` pages.

## Staging checklist

- Home, products, about, contact, privacy, terms, and the custom 404 load.
- English, German, and Greek switch without missing or stale text.
- Header, footer, canonical links, images, manifest, robots file, and sitemap
  resolve from both root and nested pages.
- Keyboard users can reach the skip link, open and close both menus, navigate
  language options with arrow keys, and see a clear focus indicator.
- Layout is readable at wide desktop, tablet, 320 px, and the 900 px navigation
  boundary; long German and Greek copy does not overflow.
- Browser console and network panel show no JavaScript errors, missing assets,
  failed translation loads, or mixed content.
- Empty, invalid, and oversized form values show the correct localized inline
  errors without sending a request.
- The Turnstile widget is keyboard-usable, the submit button remains disabled
  until it is ready, and a rapid double-click produces one API request.
- Safe direct API probes confirm wrong methods, content types, origins, invalid
  JSON, invalid fields, and invalid Turnstile tokens are rejected.
- One real staging enquiry reaches the intended mailbox with the expected
  subject, text/HTML body, and Reply-To, then shows the localized success state
  and clears the form.
- A simulated provider failure keeps the visitor's entered values and shows a
  generic localized error without exposing internal details.
- Privacy and terms links work from the form and footer.
- Response headers on the deployed site match `netlify.toml`, including CSP,
  anti-framing, referrer, permissions, and content-type protections.
- Supabase logs contain no enquiry body, raw IP, or secret, and the frontend
  source contains none of the private values from the function environment.
- The deployed commit SHA matches the release candidate that was approved.

## Rollback

If a production release must be withdrawn, identify the last known-good
production commit and create a normal Git revert. Verify the reverted deployment
and then propagate the revert to the other environment branches as needed.
