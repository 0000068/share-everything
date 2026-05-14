import { readFile, writeFile } from "node:fs/promises";

const pages = [
  { file: "index.html", pathname: "/" },
  { file: "blog.html", pathname: "/blog.html" },
  { file: "post.html", pathname: "/post.html" },
];
const checkOnly = process.argv.includes("--check");
const ogImagePath = "/og-image.jpg?v=4";
const faviconPath = "/favicon.png?v=4";

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

function updatePageMeta(source, { canonicalUrl, ogImageUrl }) {
  let nextSource = source;
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
  return nextSource;
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
const siteOrigin = normalizeSiteOrigin(config.siteUrl);
const featuredName = readFeaturedName(config);
const changedFiles = [];

for (const page of pages) {
  const source = await readFile(page.file, "utf8");
  const canonicalUrl = `${siteOrigin}${page.pathname}`;
  const ogImageUrl = `${siteOrigin}${ogImagePath}`;
  let nextSource = updatePageMeta(source, { canonicalUrl, ogImageUrl });

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
