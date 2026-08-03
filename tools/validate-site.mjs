import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredTranslationFiles = ["en", "de", "el"];
const runtimeTranslationKeys = new Set(["nav-toggle-close"]);
const unreferencedAssetAllowlist = new Set(["assets/images/hero.jpg"]);
const maximumRuntimeImageBytes = 1_000_000;
const errors = [];

const files = await walk(projectRoot);
const relativeFiles = files.map(toProjectPath);
const fileSet = new Set(relativeFiles);
const htmlFiles = relativeFiles.filter((file) => file.endsWith(".html"));
const sourceFiles = relativeFiles.filter((file) =>
  /\.(?:html|css|js|json|webmanifest)$/u.test(file) ||
  (file.startsWith("assets/js/") && file.endsWith(".mjs"))
);

validateProjectShape();
await validateNetlifyConfig();
await validateEnquiryArchitecture();
await validateJsonFiles();
await validateHtmlFiles();
await validateTranslationCoverage();
await validateLocalReferences();
await validateAssets();
await validateCss();

if (errors.length > 0) {
  console.error(`Site validation failed with ${errors.length} issue${errors.length === 1 ? "" : "s"}:`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Site validation passed: ${htmlFiles.length} HTML pages, ${requiredTranslationFiles.length} languages, ${relativeFiles.length} files.`);
}

function validateProjectShape() {
  const requiredFiles = [
    ".env.example",
    "index.html",
    "products.html",
    "about.html",
    "contact.html",
    "legal/privacy.html",
    "legal/terms.html",
    "404.html",
    "assets/css/style.css",
    "assets/js/site.js",
    "assets/js/enquiry/api-client.mjs",
    "assets/js/enquiry/config.mjs",
    "assets/js/enquiry/form-controller.mjs",
    "assets/js/enquiry/submission-gate.mjs",
    "assets/js/enquiry/turnstile-client.mjs",
    "assets/js/enquiry/validation.mjs",
    "docs/ENQUIRY_DEPLOYMENT.md",
    "robots.txt",
    "sitemap.xml",
    "site.webmanifest",
    "supabase/config.toml",
    "supabase/functions/send-enquiry/config.ts",
    "supabase/functions/send-enquiry/deno.json",
    "supabase/functions/send-enquiry/email-service.ts",
    "supabase/functions/send-enquiry/handler.ts",
    "supabase/functions/send-enquiry/http.ts",
    "supabase/functions/send-enquiry/index.ts",
    "supabase/functions/send-enquiry/rate-limit.ts",
    "supabase/functions/send-enquiry/turnstile.ts",
    "supabase/functions/send-enquiry/types.ts",
    "supabase/functions/send-enquiry/validation.ts",
    "tools/test-enquiry-frontend.mjs",
    "netlify.toml",
  ];

  requiredFiles.forEach((file) => {
    if (!fileSet.has(file)) {
      errors.push(`Required file is missing: ${file}`);
    }
  });

  if (fileSet.has("package.json")) {
    errors.push("package.json is not expected in this package-free static site.");
  }

  if (fileSet.has("app.js") || fileSet.has("assets/js/app.js")) {
    errors.push("Legacy app.js must not return; shared browser behavior belongs in assets/js/site.js.");
  }
}

async function validateNetlifyConfig() {
  const config = await readProjectFile("netlify.toml");

  requirePattern("netlify.toml", config, /connect-src[^"\r\n]+https:\/\/[^\s;]+\.supabase\.co/iu, "Supabase function CSP origin");
  requirePattern("netlify.toml", config, /frame-src[^"\r\n]+https:\/\/challenges\.cloudflare\.com/iu, "Turnstile frame CSP origin");
  requirePattern("netlify.toml", config, /script-src[^"\r\n]+https:\/\/challenges\.cloudflare\.com/iu, "Turnstile script CSP origin");

  if (/formsubmit\.co/iu.test(config)) {
    errors.push("netlify.toml must not allow the retired FormSubmit endpoint.");
  }
}

async function validateEnquiryArchitecture() {
  const publicFiles = [
    "contact.html",
    ...relativeFiles.filter((file) => file.startsWith("assets/js/enquiry/")),
  ];
  const publicSource = (await Promise.all(publicFiles.map(readProjectFile))).join("\n");
  const privateNames = [
    "RESEND_API_KEY",
    "TURNSTILE_SECRET_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "RATE_LIMIT_IP_SALT",
  ];

  for (const privateName of privateNames) {
    if (publicSource.includes(privateName)) {
      errors.push(`Private server configuration name leaked into frontend source: ${privateName}`);
    }
  }
  if (/api\.resend\.com|upstash\.io/iu.test(publicSource)) {
    errors.push("Frontend source must not call server-only email or rate-limit providers.");
  }

  const supabaseConfig = await readProjectFile("supabase/config.toml");
  requirePattern(
    "supabase/config.toml",
    supabaseConfig,
    /\[functions\.send-enquiry\][\s\S]*verify_jwt\s*=\s*false/iu,
    "public send-enquiry function configuration",
  );

  const functionSource = (await Promise.all(
    relativeFiles
      .filter((file) => file.startsWith("supabase/functions/send-enquiry/") && file.endsWith(".ts"))
      .map(readProjectFile),
  )).join("\n");
  if (/Access-Control-Allow-Origin["']?\s*[:=]\s*["']\*/iu.test(functionSource)) {
    errors.push("send-enquiry must not use wildcard CORS.");
  }

  const migrations = relativeFiles.filter((file) =>
    file.startsWith("supabase/migrations/") && file.endsWith(".sql")
  );
  if (migrations.length > 0) {
    errors.push(`The enquiry feature must not add database migrations: ${migrations.join(", ")}`);
  }
}

async function validateJsonFiles() {
  const jsonFiles = relativeFiles.filter((file) => file.endsWith(".json") || file.endsWith(".webmanifest"));

  for (const file of jsonFiles) {
    try {
      JSON.parse(await readProjectFile(file));
    } catch (error) {
      errors.push(`${file} is not valid JSON: ${error.message}`);
    }
  }
}

async function validateHtmlFiles() {
  for (const file of htmlFiles) {
    const html = await readProjectFile(file);

    requirePattern(file, html, /^<!DOCTYPE html>/iu, "HTML5 doctype");
    requirePattern(file, html, /<html\s+lang="en">/iu, "default document language");
    requirePattern(file, html, /<meta\s+charset="UTF-8">/iu, "UTF-8 charset declaration");
    requirePattern(file, html, /<meta\s+name="viewport"/iu, "viewport metadata");
    requirePattern(file, html, /<title\b[^>]*>[^<]+<\/title>/iu, "non-empty page title");
    requirePattern(file, html, /<meta\s+name="description"\s+content="[^"]+"/iu, "meta description");
    requirePattern(file, html, /<main\s+id="main-content"/iu, "main landmark with #main-content");
    requirePattern(file, html, /<div\s+id="header"><\/div>/iu, "shared header mount");
    requirePattern(file, html, /<div\s+id="footer"><\/div>/iu, "shared footer mount");
    requirePattern(file, html, /<link\s+rel="icon"\s+href="\/assets\/icons\/logo\.svg"/iu, "SVG favicon");
    requirePattern(file, html, /<link\s+rel="manifest"\s+href="\/site\.webmanifest">/iu, "web manifest link");
    requirePattern(file, html, /<link\s+rel="stylesheet"\s+href="\/assets\/css\/style\.css">/iu, "shared stylesheet");
    requirePattern(file, html, /<script\s+src="\/assets\/js\/site\.js"\s+defer><\/script>/iu, "deferred shared script");

    if (file === "404.html") {
      requirePattern(file, html, /<meta\s+name="robots"\s+content="noindex, follow">/iu, "noindex directive");
    } else {
      requirePattern(file, html, /<link\s+rel="canonical"\s+href="https:\/\/www\.aethera\.gr\/[^"]*">/iu, "production canonical URL");
      requirePattern(file, html, /<meta\s+property="og:title"/iu, "Open Graph title");
      requirePattern(file, html, /<meta\s+property="og:description"/iu, "Open Graph description");
      requirePattern(file, html, /<meta\s+property="og:url"\s+content="https:\/\/www\.aethera\.gr\/[^"]*">/iu, "Open Graph URL");
    }

    const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      errors.push(`${file} contains duplicate IDs: ${[...new Set(duplicateIds)].join(", ")}`);
    }

    for (const match of html.matchAll(/<img\b[^>]*>/giu)) {
      const image = match[0];
      if (!/\salt="[^"]*"/iu.test(image)) {
        errors.push(`${file} contains an image without an alt attribute: ${compact(image)}`);
      }
      if (!/\swidth="\d+"/iu.test(image) || !/\sheight="\d+"/iu.test(image)) {
        errors.push(`${file} contains an image without intrinsic dimensions: ${compact(image)}`);
      }
    }

    for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/giu)) {
      if (!/\srel="[^"]*noopener[^"]*"/iu.test(match[0])) {
        errors.push(`${file} contains a target=_blank link without rel=noopener.`);
      }
    }

    if (file === "contact.html") {
      const enquiryForm = html.match(/<form\b[^>]*data-enquiry-form[^>]*>/iu)?.[0] ?? "";
      requirePattern(file, html, /<form\b[^>]*method="post"[^>]*data-enquiry-form[^>]*novalidate[^>]*>/iu, "script-controlled enquiry form");
      requirePattern(file, html, /name="website"/iu, "form honeypot");
      requirePattern(file, html, /data-turnstile-container/iu, "Turnstile container");
      requirePattern(file, html, /data-form-status[^>]*|<p\b[^>]*data-form-status/iu, "live form status");
      requirePattern(file, html, /<script\s+type="module"\s+src="\/assets\/js\/enquiry\/form-controller\.mjs"><\/script>/iu, "enquiry controller module");
      requirePattern(file, html, /href="\/legal\/privacy\.html"/iu, "form privacy link");

      if (/\saction=/iu.test(enquiryForm)) {
        errors.push("contact.html enquiry form must submit through the API client, not an HTML action.");
      }
      if (/formsubmit\.co|name="_(?:honey|next|subject)"/iu.test(html)) {
        errors.push("contact.html still contains retired FormSubmit configuration.");
      }

      for (const field of [
        "company",
        "country",
        "contactPerson",
        "email",
        "businessType",
        "productInterest",
        "annualVolume",
        "requirements",
      ]) {
        requirePattern(file, html, new RegExp(`data-field-error="${field}"`, "u"), `${field} inline error`);
      }
    }
  }
}

async function validateTranslationCoverage() {
  const source = (await Promise.all(
    sourceFiles
      .filter((file) => /\.(?:html|m?js)$/u.test(file))
      .map(readProjectFile),
  )).join("\n");
  const usedKeys = new Set(runtimeTranslationKeys);

  for (const match of source.matchAll(/data-i18n(?:-html|-placeholder|-alt|-content|-aria-label)?="([^"]+)"/gu)) {
    usedKeys.add(match[1]);
  }

  let canonicalKeys;
  for (const language of requiredTranslationFiles) {
    const file = `i18n/${language}.json`;
    let translations;

    try {
      translations = JSON.parse(await readProjectFile(file));
    } catch {
      continue;
    }

    const keys = new Set(Object.keys(translations));
    if (!canonicalKeys) {
      canonicalKeys = keys;
    } else {
      const missingFromLanguage = [...canonicalKeys].filter((key) => !keys.has(key));
      const extraInLanguage = [...keys].filter((key) => !canonicalKeys.has(key));
      if (missingFromLanguage.length > 0) {
        errors.push(`${file} is missing dictionary keys: ${missingFromLanguage.join(", ")}`);
      }
      if (extraInLanguage.length > 0) {
        errors.push(`${file} has keys not present in English: ${extraInLanguage.join(", ")}`);
      }
    }

    const missingUsedKeys = [...usedKeys].filter((key) => !keys.has(key));
    const orphanedKeys = [...keys].filter((key) => !usedKeys.has(key));
    const emptyKeys = [...keys].filter((key) => typeof translations[key] !== "string" || translations[key].trim() === "");

    if (missingUsedKeys.length > 0) {
      errors.push(`${file} is missing used keys: ${missingUsedKeys.join(", ")}`);
    }
    if (orphanedKeys.length > 0) {
      errors.push(`${file} contains unused keys: ${orphanedKeys.join(", ")}`);
    }
    if (emptyKeys.length > 0) {
      errors.push(`${file} contains empty or non-string values: ${emptyKeys.join(", ")}`);
    }

    for (const [key, value] of Object.entries(translations)) {
      if (!value.includes("<")) {
        continue;
      }

      const withoutAllowedMarkup = value.replace(/<\/?strong>|<br\s*\/?\s*>/giu, "");
      if (withoutAllowedMarkup.includes("<")) {
        errors.push(`${file} key ${key} contains markup outside the allowed <strong> and <br> tags.`);
      }
    }
  }
}

async function validateLocalReferences() {
  for (const file of sourceFiles) {
    const source = await readProjectFile(file);
    const references = [];

    if (/\.(?:html|m?js)$/u.test(file)) {
      references.push(...[...source.matchAll(/\b(?:href|src)="([^"]+)"/gu)].map((match) => match[1]));
    }
    if (file.endsWith(".css")) {
      references.push(...[...source.matchAll(/url\(["']?([^"')]+)["']?\)/gu)].map((match) => match[1]));
    }
    if (file === "site.webmanifest") {
      const manifest = JSON.parse(source);
      references.push(...(manifest.icons ?? []).map((icon) => icon.src));
    }

    for (const reference of references) {
      const resolved = resolveLocalReference(file, reference);
      if (resolved && !fileSet.has(resolved)) {
        errors.push(`${file} references missing local file: ${reference}`);
      }
    }
  }
}

async function validateAssets() {
  const assetFiles = relativeFiles.filter((file) => file.startsWith("assets/") && !/\.(?:css|m?js)$/u.test(file));
  const allSource = (await Promise.all(sourceFiles.map(readProjectFile))).join("\n");

  for (const asset of assetFiles) {
    const filename = path.posix.basename(asset);
    if (!allSource.includes(filename) && !unreferencedAssetAllowlist.has(asset)) {
      errors.push(`Asset is not referenced: ${asset}`);
    }

    if (/\.(?:jpe?g|png|webp|avif)$/iu.test(asset) && !unreferencedAssetAllowlist.has(asset)) {
      const metadata = await stat(path.join(projectRoot, asset));
      if (metadata.size > maximumRuntimeImageBytes) {
        errors.push(`Runtime image exceeds ${maximumRuntimeImageBytes} bytes: ${asset} (${metadata.size} bytes)`);
      }
    }

    if (asset.endsWith(".svg")) {
      const svg = await readProjectFile(asset);
      if (!/<svg\b/iu.test(svg) || !/<\/svg>/iu.test(svg)) {
        errors.push(`${asset} does not contain a complete SVG root element.`);
      }
    }
  }
}

async function validateCss() {
  const css = await readProjectFile("assets/css/style.css");
  if (/@import\b/iu.test(css)) {
    errors.push("assets/css/style.css must not use render-blocking @import rules.");
  }
}

function requirePattern(file, source, pattern, description) {
  if (!pattern.test(source)) {
    errors.push(`${file} is missing ${description}.`);
  }
}

function resolveLocalReference(sourceFile, reference) {
  if (
    reference.startsWith("#") ||
    /^(?:https?:|mailto:|tel:|data:)/iu.test(reference) ||
    reference.includes("${")
  ) {
    return null;
  }

  const cleanReference = reference.split(/[?#]/u)[0];
  if (!cleanReference) {
    return null;
  }

  let resolved;
  if (cleanReference.startsWith("/")) {
    resolved = cleanReference.slice(1);
  } else {
    resolved = path.posix.join(path.posix.dirname(sourceFile), cleanReference);
  }

  if (resolved === "" || resolved.endsWith("/")) {
    resolved = `${resolved}index.html`;
  }

  return path.posix.normalize(resolved);
}

async function readProjectFile(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const discovered = [];

  for (const entry of entries) {
    if (entry.name === ".git") {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      discovered.push(...await walk(absolutePath));
    } else if (entry.isFile()) {
      discovered.push(absolutePath);
    }
  }

  return discovered;
}

function toProjectPath(absolutePath) {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}

function compact(value) {
  return value.replace(/\s+/gu, " ").slice(0, 140);
}
