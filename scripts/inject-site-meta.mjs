import { readFile, writeFile } from "node:fs/promises";
import { escapeHtmlAttribute } from "./lib/html-escape.mjs";

const pages = [
  {
    file: "index.html",
    pathname: "/",
    title: ({ siteName }) => siteName,
    ogTitle: ({ siteName }) => siteName,
    description: ({ siteName }) => `${siteName} — \u63a2\u7d22\u3001\u8bb0\u5f55\u3001\u5206\u4eab`,
    heroTitle: true,
  },
  {
    file: "blog.html",
    pathname: "/blog.html",
    title: ({ siteName }) => `\u603b\u89c8 — ${siteName}`,
    ogTitle: ({ siteName }) => `\u603b\u89c8 — ${siteName}`,
  },
  {
    file: "post.html",
    pathname: "/post.html",
    title: ({ siteName }) => `\u6587\u7ae0 — ${siteName}`,
    ogTitle: ({ siteName }) => siteName,
  },
];
const modulePreloadPaths = [
  "font-loader.js",
  "notion-content-shared.js",
  "runtime-core.js",
  "site-utils.js",
  "common.js",
  "ui-effects.js",
  "seo-meta.js",
  "spa-router.js",
];
const checkOnly = process.argv.includes("--check");
const ogImagePath = "/og-image.jpg?v=4";
const faviconPath = "/favicon.png?v=4";
const manifestPath = "/manifest.webmanifest";
const defaultSiteName = "Share Everything";

function normalizeSiteOrigin(value) {
  const url = new URL(String(value || "").trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("site.config.json siteUrl must use http or https");
  }

  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/+$/, "");
}

function readSiteName(config) {
  const siteName = config?.siteName;
  return typeof siteName === "string" && siteName.trim()
    ? siteName.trim()
    : defaultSiteName;
}

function readAssetVersion(appSource) {
  const match = String(appSource || "").match(/const\s+ASSET_VERSION\s*=\s*"([^"]+)";/);
  if (!match) {
    throw new Error("Unable to read app.js ASSET_VERSION");
  }
  return match[1];
}

function readFeaturedName(config) {
  const featuredName = config?.categoryNavigation?.featured?.name;
  return typeof featuredName === "string" && featuredName.trim()
    ? featuredName.trim()
    : "精选";
}

function readShortSiteName(siteName) {
  return siteName === defaultSiteName ? "Share" : siteName.slice(0, 12);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`Unable to update ${label}`);
  }

  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function replaceRequiredWith(source, pattern, replacer, label) {
  if (!pattern.test(source)) {
    throw new Error(`Unable to update ${label}`);
  }

  pattern.lastIndex = 0;
  return source.replace(pattern, replacer);
}

function resolveTemplate(value, context) {
  return typeof value === "function" ? value(context) : value;
}

function upsertApplicationName(source, siteName) {
  const markup = `<meta name="application-name" content="${escapeHtmlAttribute(siteName)}" />`;
  const existingPattern = /<meta\s+name="application-name"\s+content="[^"]*"\s*\/?>/;
  if (existingPattern.test(source)) {
    return source.replace(existingPattern, () => markup);
  }

  return replaceRequiredWith(
    source,
    /(<meta\s+name="theme-color"\s+content="[^"]*"\s*\/?>)/,
    (_match, anchor) => `${anchor}\n    ${markup}`,
    "application-name",
  );
}

function upsertNamedMeta(source, { name, content, insertAfterName, label }) {
  const markup = `<meta name="${name}" content="${escapeHtmlAttribute(content)}" />`;
  const existingPattern = new RegExp(`<meta\\s+name="${escapeRegExp(name)}"\\s+content="[^"]*"\\s*\\/?>`);
  if (existingPattern.test(source)) {
    return source.replace(existingPattern, () => markup);
  }

  return replaceRequiredWith(
    source,
    new RegExp(`(<meta\\s+name="${escapeRegExp(insertAfterName)}"\\s+content="[^"]*"\\s*\\/?>)`),
    (_match, anchor) => `${anchor}\n    ${markup}`,
    label,
  );
}

function upsertManifestLink(source) {
  const markup = `<link rel="manifest" href="${manifestPath}" />`;
  const existingPattern = /<link\s+rel="manifest"\s+href="[^"]*"\s*\/?>/;
  if (existingPattern.test(source)) {
    return source.replace(existingPattern, () => markup);
  }

  return replaceRequiredWith(
    source,
    /(<link\s+rel="icon"\s+type="image\/png"(?:\s+sizes="[^"]*")?\s+href="[^"]*"\s*\/?>)/,
    (_match, anchor) => `${anchor}\n    ${markup}`,
    "web app manifest link",
  );
}

function upsertStandaloneMetadata(source, siteName) {
  let nextSource = upsertApplicationName(source, siteName);
  nextSource = upsertNamedMeta(nextSource, {
    name: "mobile-web-app-capable",
    content: "yes",
    insertAfterName: "application-name",
    label: "mobile web app capable",
  });
  nextSource = upsertNamedMeta(nextSource, {
    name: "apple-mobile-web-app-capable",
    content: "yes",
    insertAfterName: "mobile-web-app-capable",
    label: "apple mobile web app capable",
  });
  nextSource = upsertNamedMeta(nextSource, {
    name: "apple-mobile-web-app-status-bar-style",
    content: "black-translucent",
    insertAfterName: "apple-mobile-web-app-capable",
    label: "apple mobile status bar style",
  });
  nextSource = upsertNamedMeta(nextSource, {
    name: "apple-mobile-web-app-title",
    content: siteName,
    insertAfterName: "apple-mobile-web-app-status-bar-style",
    label: "apple mobile web app title",
  });
  return upsertManifestLink(nextSource);
}

function buildWebManifest(siteName) {
  return `${JSON.stringify({
    name: siteName,
    short_name: readShortSiteName(siteName),
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0a0e1a",
    theme_color: "#111528",
    icons: [
      {
        src: faviconPath,
        sizes: "256x256",
        type: "image/png",
        purpose: "any",
      },
    ],
  }, null, 2)}\n`;
}

function updateHeroTitle(source, siteName) {
  return replaceRequiredWith(
    source,
    /(<h1\b[^>]*\bclass="hero-title"[^>]*>)[\s\S]*?(<\/h1>)/,
    (_match, prefix, suffix) => `${prefix}${escapeHtmlAttribute(siteName)}${suffix}`,
    "hero title",
  );
}

function updatePageMeta(source, { canonicalUrl, ogImageUrl, page, siteName }) {
  const title = resolveTemplate(page.title, { siteName });
  const ogTitle = resolveTemplate(page.ogTitle, { siteName });
  const description = resolveTemplate(page.description, { siteName });
  let nextSource = source;
  nextSource = upsertStandaloneMetadata(nextSource, siteName);
  nextSource = replaceRequired(
    nextSource,
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtmlAttribute(title)}</title>`,
    "title",
  );
  if (typeof description === "string" && description) {
    nextSource = replaceRequired(
      nextSource,
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeHtmlAttribute(description)}" />`,
      "description",
    );
  }
  nextSource = replaceRequired(
    nextSource,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escapeHtmlAttribute(ogTitle)}" />`,
    "og:title",
  );
  nextSource = replaceRequired(
    nextSource,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${escapeHtmlAttribute(canonicalUrl)}" />`,
    "og:url",
  );
  nextSource = replaceRequired(
    nextSource,
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:image" content="${escapeHtmlAttribute(ogImageUrl)}" />`,
    "og:image",
  );
  nextSource = replaceRequired(
    nextSource,
    /<meta\s+property="og:image:alt"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:image:alt" content="${escapeHtmlAttribute(siteName)}" />`,
    "og:image:alt",
  );
  nextSource = replaceRequired(
    nextSource,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${escapeHtmlAttribute(canonicalUrl)}" />`,
    "canonical",
  );
  nextSource = replaceRequired(
    nextSource,
    /<link\s+rel="icon"\s+type="image\/png"(?:\s+sizes="[^"]*")?\s+href="[^"]*"\s*\/?>/,
    `<link rel="icon" type="image/png" href="${faviconPath}" />`,
    "favicon",
  );
  if (page.heroTitle) {
    nextSource = updateHeroTitle(nextSource, siteName);
  }
  return nextSource;
}

function buildModulePreloadMarkup(assetVersion) {
  return modulePreloadPaths
    .map((filename) => `    <link rel="modulepreload" href="/js/${filename}?v=${escapeHtmlAttribute(assetVersion)}" />`)
    .join("\n");
}

function updateModulePreloads(source, assetVersion) {
  const withoutPreloads = source.replace(
    /^[ \t]*<link\s+rel="modulepreload"\s+href="\/js\/[^"]+"\s*\/?>\r?\n?/gm,
    "",
  );
  return replaceRequired(
    withoutPreloads,
    /\n\s*<\/head>/,
    `\n${buildModulePreloadMarkup(assetVersion)}\n  </head>`,
    "modulepreload hints",
  );
}

function updateFeaturedCta(source, featuredName) {
  const featuredHref = `/blog.html?category=${encodeURIComponent(featuredName)}`;
  let nextSource = replaceRequiredWith(
    source,
    /(<a[^>]*\bid="ctaStart"[^>]*\bhref=")[^"]*(")/,
    (_match, prefix, suffix) => `${prefix}${escapeHtmlAttribute(featuredHref)}${suffix}`,
    "featured CTA href",
  );
  nextSource = replaceRequiredWith(
    nextSource,
    /(<a[^>]*\bid="ctaStart"[^>]*\baria-label=")[^"]*(")/,
    (_match, prefix, suffix) => `${prefix}${escapeHtmlAttribute(featuredName)}${suffix}`,
    "featured CTA aria-label",
  );
  return replaceRequiredWith(
    nextSource,
    /(<a[^>]*\bid="ctaStart"[^>]*>[\s\S]*?<span class="btn-tooltip">)[\s\S]*?(<\/span>)/,
    (_match, prefix, suffix) => `${prefix}${escapeHtmlAttribute(featuredName)}${suffix}`,
    "featured CTA tooltip",
  );
}

const config = JSON.parse(await readFile("site.config.json", "utf8"));
const appSource = await readFile("js/app.js", "utf8");
const siteOrigin = normalizeSiteOrigin(config.siteUrl);
const siteName = readSiteName(config);
const featuredName = readFeaturedName(config);
const assetVersion = readAssetVersion(appSource);
const changedFiles = [];

for (const page of pages) {
  const source = await readFile(page.file, "utf8");
  const canonicalUrl = `${siteOrigin}${page.pathname}`;
  const ogImageUrl = `${siteOrigin}${ogImagePath}`;
  let nextSource = updatePageMeta(source, { canonicalUrl, ogImageUrl, page, siteName });
  nextSource = updateModulePreloads(nextSource, assetVersion);

  if (page.file === "index.html") {
    nextSource = updateFeaturedCta(nextSource, featuredName);
  }

  if (nextSource !== source) {
    changedFiles.push(page.file);
    if (!checkOnly) {
      await writeFile(page.file, nextSource);
    }
  }
}

const manifestSource = await readFile("manifest.webmanifest", "utf8");
const nextManifestSource = buildWebManifest(siteName);
if (nextManifestSource !== manifestSource) {
  changedFiles.push("manifest.webmanifest");
  if (!checkOnly) {
    await writeFile("manifest.webmanifest", nextManifestSource);
  }
}

if (checkOnly && changedFiles.length > 0) {
  console.error(`Static site metadata is out of sync: ${changedFiles.join(", ")}`);
  process.exit(1);
}

if (!checkOnly && changedFiles.length > 0) {
  console.log(`Updated static site metadata: ${changedFiles.join(", ")}`);
}
