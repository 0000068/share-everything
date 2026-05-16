import { readFile, writeFile } from "node:fs/promises";
import { escapeHtmlAttribute } from "./lib/html-escape.mjs";
import {
  findElement,
  findElementById,
  findElements,
  findLinkByRel,
  findMetaByName,
  findMetaByProperty,
  parseHtml,
  setAttribute,
} from "./lib/html-rewriter.mjs";

const pages = [
  {
    file: "index.html",
    pathname: "/",
    title: ({ siteName }) => siteName,
    ogTitle: ({ siteName }) => siteName,
    description: ({ siteName }) => `${siteName} — 探索、记录、分享`,
    heroTitle: true,
  },
  {
    file: "blog.html",
    pathname: "/blog.html",
    title: ({ siteName }) => `总览 — ${siteName}`,
    ogTitle: ({ siteName }) => `总览 — ${siteName}`,
  },
  {
    file: "post.html",
    pathname: "/post.html",
    title: ({ siteName }) => `文章 — ${siteName}`,
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

function resolveTemplate(value, context) {
  return typeof value === "function" ? value(context) : value;
}

function requireNode(node, label) {
  if (!node?.sourceCodeLocation) throw new Error(`Unable to update ${label}`);
  return node;
}

function attrValue(node, name) {
  return node.attrs?.find((attr) => attr.name === name)?.value || "";
}

function renderAttributes(node) {
  return (node.attrs || [])
    .map((attr) => ` ${attr.name}="${escapeHtmlAttribute(attr.value)}"`)
    .join("");
}

function renderStartTag(node) {
  return `<${node.tagName}${renderAttributes(node)}>`;
}

function renderVoidTag(node) {
  return `<${node.tagName}${renderAttributes(node)} />`;
}

function replaceNode(ranges, node, markup) {
  ranges.push({
    start: node.sourceCodeLocation.startOffset,
    end: node.sourceCodeLocation.endOffset,
    markup,
  });
}

function replaceStartTag(ranges, node, markup = renderStartTag(node)) {
  ranges.push({
    start: node.sourceCodeLocation.startTag.startOffset,
    end: node.sourceCodeLocation.startTag.endOffset,
    markup,
  });
}

function replaceInner(ranges, node, markup) {
  ranges.push({
    start: node.sourceCodeLocation.startTag.endOffset,
    end: node.sourceCodeLocation.endTag.startOffset,
    markup,
  });
}

function insertAfter(ranges, node, markup) {
  ranges.push({
    start: node.sourceCodeLocation.endOffset,
    end: node.sourceCodeLocation.endOffset,
    markup,
  });
}

function applyRanges(source, ranges) {
  return ranges
    .sort((a, b) => b.start - a.start)
    .reduce((nextSource, { start, end, markup }) => (
      `${nextSource.slice(0, start)}${markup}${nextSource.slice(end)}`
    ), source);
}

function upsertNamedMeta(doc, ranges, { name, content, insertAfterName, label }) {
  const node = findMetaByName(doc, name);
  if (node) {
    setAttribute(node, "name", name);
    setAttribute(node, "content", content);
    replaceNode(ranges, requireNode(node, label), renderVoidTag(node));
    return node;
  }

  const anchor = requireNode(findMetaByName(doc, insertAfterName), label);
  insertAfter(ranges, anchor, `\n    <meta name="${name}" content="${escapeHtmlAttribute(content)}" />`);
  return anchor;
}

function upsertApplicationName(doc, ranges, siteName) {
  const node = findMetaByName(doc, "application-name");
  if (node) {
    setAttribute(node, "content", siteName);
    replaceNode(ranges, requireNode(node, "application-name"), renderVoidTag(node));
    return node;
  }

  const anchor = requireNode(findMetaByName(doc, "theme-color"), "application-name");
  insertAfter(ranges, anchor, `\n    <meta name="application-name" content="${escapeHtmlAttribute(siteName)}" />`);
  return anchor;
}

function upsertLinkNode(doc, ranges, { rel, href, attrs = {}, insertAfterRel, label }) {
  const node = findLinkByRel(doc, rel);
  if (node) {
    setAttribute(node, "rel", rel);
    setAttribute(node, "href", href);
    for (const [name, value] of Object.entries(attrs)) {
      setAttribute(node, name, value);
    }
    replaceNode(ranges, requireNode(node, label), renderVoidTag(node));
    return node;
  }

  const attrMarkup = Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeHtmlAttribute(value)}"`)
    .join("");
  const anchor = requireNode(findLinkByRel(doc, insertAfterRel), label);
  insertAfter(ranges, anchor, `\n    <link rel="${rel}"${attrMarkup} href="${escapeHtmlAttribute(href)}" />`);
  return anchor;
}

function upsertStandaloneMetadata(doc, ranges, siteName) {
  const applicationName = upsertApplicationName(doc, ranges, siteName);
  upsertNamedMeta(doc, ranges, {
    name: "mobile-web-app-capable",
    content: "yes",
    insertAfterName: "application-name",
    label: "mobile web app capable",
  });
  upsertNamedMeta(doc, ranges, {
    name: "apple-mobile-web-app-capable",
    content: "yes",
    insertAfterName: "mobile-web-app-capable",
    label: "apple mobile web app capable",
  });
  upsertNamedMeta(doc, ranges, {
    name: "apple-mobile-web-app-status-bar-style",
    content: "black-translucent",
    insertAfterName: "apple-mobile-web-app-capable",
    label: "apple mobile status bar style",
  });
  upsertNamedMeta(doc, ranges, {
    name: "apple-mobile-web-app-title",
    content: siteName,
    insertAfterName: "apple-mobile-web-app-status-bar-style",
    label: "apple mobile web app title",
  });
  upsertLinkNode(doc, ranges, {
    rel: "manifest",
    href: manifestPath,
    insertAfterRel: "icon",
    label: "web app manifest link",
  });
  return applicationName;
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

function updateHeroTitle(doc, ranges, siteName) {
  const node = requireNode(findElement(doc, (candidate) => candidate.tagName === "h1" && attrValue(candidate, "class").split(/\s+/).includes("hero-title")), "hero title");
  replaceInner(ranges, node, escapeHtmlAttribute(siteName));
}

function updateMetaProperty(doc, ranges, property, content) {
  const node = requireNode(findMetaByProperty(doc, property), property);
  setAttribute(node, "content", content);
  replaceNode(ranges, node, renderVoidTag(node));
}

function updateMetaName(doc, ranges, name, content) {
  const node = requireNode(findMetaByName(doc, name), name);
  setAttribute(node, "content", content);
  replaceNode(ranges, node, renderVoidTag(node));
}

function updatePageMeta(doc, ranges, { canonicalUrl, ogImageUrl, page, siteName }) {
  const title = resolveTemplate(page.title, { siteName });
  const ogTitle = resolveTemplate(page.ogTitle, { siteName });
  const description = resolveTemplate(page.description, { siteName });
  upsertStandaloneMetadata(doc, ranges, siteName);
  replaceInner(ranges, requireNode(findElement(doc, (node) => node.tagName === "title"), "title"), escapeHtmlAttribute(title));
  if (typeof description === "string" && description) {
    updateMetaName(doc, ranges, "description", description);
  }
  updateMetaProperty(doc, ranges, "og:title", ogTitle);
  updateMetaProperty(doc, ranges, "og:url", canonicalUrl);
  updateMetaProperty(doc, ranges, "og:image", ogImageUrl);
  updateMetaProperty(doc, ranges, "og:image:alt", siteName);
  upsertLinkNode(doc, ranges, {
    rel: "canonical",
    href: canonicalUrl,
    label: "canonical",
  });
  upsertLinkNode(doc, ranges, {
    rel: "icon",
    href: faviconPath,
    attrs: { type: "image/png" },
    label: "favicon",
  });
  if (page.heroTitle) {
    updateHeroTitle(doc, ranges, siteName);
  }
}

function updateModulePreloads(source, doc, ranges, assetVersion) {
  const nodes = findElements(doc, (node) => (
    node.tagName === "link" && attrValue(node, "rel") === "modulepreload"
  ));
  const markup = modulePreloadPaths
    .map((filename) => `    <link rel="modulepreload" href="/js/${filename}?v=${escapeHtmlAttribute(assetVersion)}" />`)
    .join("\n");

  if (nodes.length > 0) {
    const first = requireNode(nodes[0], "modulepreload hints");
    const last = requireNode(nodes.at(-1), "modulepreload hints");
    const lineStart = source.lastIndexOf("\n", first.sourceCodeLocation.startOffset) + 1;
    ranges.push({
      start: lineStart,
      end: last.sourceCodeLocation.endOffset,
      markup,
    });
    return;
  }

  const head = requireNode(findElement(doc, (node) => node.tagName === "head"), "modulepreload hints");
  ranges.push({
    start: head.sourceCodeLocation.endTag.startOffset,
    end: head.sourceCodeLocation.endTag.startOffset,
    markup: `${markup}\n  `,
  });
}

function updateFeaturedCta(doc, ranges, featuredName) {
  const cta = requireNode(findElementById(doc, "ctaStart"), "featured CTA");
  const featuredHref = `/blog.html?category=${encodeURIComponent(featuredName)}`;
  setAttribute(cta, "href", featuredHref);
  setAttribute(cta, "aria-label", featuredName);
  replaceStartTag(ranges, cta);
  const tooltip = requireNode(findElement(cta, (node) => node.tagName === "span" && attrValue(node, "class").split(/\s+/).includes("btn-tooltip")), "featured CTA tooltip");
  replaceInner(ranges, tooltip, escapeHtmlAttribute(featuredName));
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
  const doc = parseHtml(source);
  const ranges = [];
  updatePageMeta(doc, ranges, { canonicalUrl, ogImageUrl, page, siteName });
  updateModulePreloads(source, doc, ranges, assetVersion);
  if (page.file === "index.html") {
    updateFeaturedCta(doc, ranges, featuredName);
  }
  const nextSource = applyRanges(source, ranges);

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
