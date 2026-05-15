import { readFile, writeFile } from "node:fs/promises";

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
const defaultSiteName = "Share Everything";

function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

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

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`Unable to update ${label}`);
  }

  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function resolveTemplate(value, context) {
  return typeof value === "function" ? value(context) : value;
}

function upsertApplicationName(source, siteName) {
  const markup = `<meta name="application-name" content="${escapeAttribute(siteName)}" />`;
  const existingPattern = /<meta\s+name="application-name"\s+content="[^"]*"\s*\/?>/;
  if (existingPattern.test(source)) {
    return source.replace(existingPattern, markup);
  }

  return replaceRequired(
    source,
    /(<meta\s+name="theme-color"\s+content="[^"]*"\s*\/?>)/,
    `$1\n    ${markup}`,
    "application-name",
  );
}

function updateHeroTitle(source, siteName) {
  return replaceRequired(
    source,
    /(<h1\b[^>]*\bclass="hero-title"[^>]*>)[\s\S]*?(<\/h1>)/,
    `$1${escapeAttribute(siteName)}$2`,
    "hero title",
  );
}

function updatePageMeta(source, { canonicalUrl, ogImageUrl, page, siteName }) {
  const title = resolveTemplate(page.title, { siteName });
  const ogTitle = resolveTemplate(page.ogTitle, { siteName });
  const description = resolveTemplate(page.description, { siteName });
  let nextSource = source;
  nextSource = upsertApplicationName(nextSource, siteName);
  nextSource = replaceRequired(
    nextSource,
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeAttribute(title)}</title>`,
    "title",
  );
  if (typeof description === "string" && description) {
    nextSource = replaceRequired(
      nextSource,
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeAttribute(description)}" />`,
      "description",
    );
  }
  nextSource = replaceRequired(
    nextSource,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escapeAttribute(ogTitle)}" />`,
    "og:title",
  );
  nextSource = replaceRequired(
    nextSource,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${escapeAttribute(canonicalUrl)}" />`,
    "og:url",
  );
  nextSource = replaceRequired(
    nextSource,
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:image" content="${escapeAttribute(ogImageUrl)}" />`,
    "og:image",
  );
  nextSource = replaceRequired(
    nextSource,
    /<meta\s+property="og:image:alt"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:image:alt" content="${escapeAttribute(siteName)}" />`,
    "og:image:alt",
  );
  nextSource = replaceRequired(
    nextSource,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />`,
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
    .map((filename) => `    <link rel="modulepreload" href="/js/${filename}?v=${escapeAttribute(assetVersion)}" />`)
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
  let nextSource = replaceRequired(
    source,
    /(<a[^>]*\bid="ctaStart"[^>]*\bhref=")[^"]*(")/,
    `$1${escapeAttribute(featuredHref)}$2`,
    "featured CTA href",
  );
  nextSource = replaceRequired(
    nextSource,
    /(<a[^>]*\bid="ctaStart"[^>]*\baria-label=")[^"]*(")/,
    `$1${escapeAttribute(featuredName)}$2`,
    "featured CTA aria-label",
  );
  return replaceRequired(
    nextSource,
    /(<a[^>]*\bid="ctaStart"[^>]*>[\s\S]*?<span class="btn-tooltip">)[\s\S]*?(<\/span>)/,
    `$1${escapeAttribute(featuredName)}$2`,
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

if (checkOnly && changedFiles.length > 0) {
  console.error(`Static site metadata is out of sync: ${changedFiles.join(", ")}`);
  process.exit(1);
}

if (!checkOnly && changedFiles.length > 0) {
  console.log(`Updated static site metadata: ${changedFiles.join(", ")}`);
}
