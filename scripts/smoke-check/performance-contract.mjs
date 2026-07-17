import fs from "node:fs";
import path from "node:path";

const PAGE_BUDGETS = Object.freeze({
  "index.html": { maxRequests: 11, maxBytes: 140 * 1024 },
  "blog.html": { maxRequests: 17, maxBytes: 256 * 1024 },
  "post.html": { maxRequests: 18, maxBytes: 320 * 1024 },
});

function readAttribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}="([^"]+)"`, "i"))?.[1] || "";
}

function collectCriticalAssetUrls(html) {
  const urls = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = readAttribute(tag, "rel");
    if (rel !== "stylesheet" && rel !== "modulepreload") continue;
    const href = readAttribute(tag, "href");
    if (href.startsWith("/")) urls.push(href);
  }
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="[^"]+"[^>]*>/gi)) {
    const src = readAttribute(match[0], "src");
    if (src.startsWith("/")) urls.push(src);
  }
  return [...new Set(urls)];
}

function getLocalAssetSize(rootDir, assetUrl) {
  const pathname = new URL(assetUrl, "https://local.invalid").pathname;
  const file = path.resolve(rootDir, `.${pathname}`);
  const relativePath = path.relative(rootDir, file);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Critical asset escaped project root: ${assetUrl}`);
  }
  return fs.statSync(file).size;
}

export function collectPagePerformanceMetrics(rootDir, html) {
  const assetUrls = collectCriticalAssetUrls(html);
  return {
    assetUrls,
    requestCount: assetUrls.length,
    totalBytes: assetUrls.reduce((total, url) => total + getLocalAssetSize(rootDir, url), 0),
  };
}

export function runPerformanceContractChecks({ assert, pageHtmlByLabel, rootDir, sourceText }) {
  for (const [label, html] of pageHtmlByLabel) {
    const metrics = collectPagePerformanceMetrics(rootDir, html);
    const budget = PAGE_BUDGETS[label];
    assert.ok(metrics.requestCount <= budget.maxRequests, `${label} critical request count ${metrics.requestCount} exceeded ${budget.maxRequests}`);
    assert.ok(metrics.totalBytes <= budget.maxBytes, `${label} critical bytes ${metrics.totalBytes} exceeded ${budget.maxBytes}`);
  }

  assert.doesNotMatch(sourceText, /fonts\.(?:googleapis|gstatic)(?:\.cn)?/i, "critical source should contain no external Google font host");
  const blogHtml = pageHtmlByLabel.find(([label]) => label === "blog.html")?.[1] || "";
  assert.ok(
    blogHtml.indexOf("data-blog-bootstrap") < blogHtml.indexOf("data-spa-runtime"),
    "blog data bootstrap should execute before app.js",
  );
  assert.doesNotMatch(
    blogHtml,
    /\/js\/notion-article-renderer\.js(?:\?|")/,
    "blog critical assets should not include the article shell renderer",
  );
  assert.doesNotMatch(
    blogHtml,
    /\/js\/notion-content\.js(?:\?|")/,
    "blog critical assets should not include the full article block renderer",
  );
}
