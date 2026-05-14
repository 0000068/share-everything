import { notionBlockFixtures } from "./fixtures/notion-block-fixtures.mjs";
import { runApiContractChecks } from "./smoke-check/api-contracts.mjs";
import { runBlogPageChecks } from "./smoke-check/blog-page.mjs";
import { runImageProxyChecks } from "./smoke-check/image-proxy.mjs";
import { runMobileLayoutChecks } from "./smoke-check/mobile-layout.mjs";
import { runContentModuleChecks } from "./smoke-check/content-modules.mjs";
import { runNotionApiClientChecks } from "./smoke-check/notion-api-client.mjs";
import { runPublicContentAndNotionChecks } from "./smoke-check/public-content-notion.mjs";
import { runRoutingAndVercelChecks } from "./smoke-check/routing-vercel.mjs";
import { runServerModuleChecks } from "./smoke-check/server-modules.mjs";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  assert,
  Buffer,
  FIXTURE_BASE_ORIGIN,
  FakeElement,
  checkSyntax,
  createApiResponseRecorder,
  createClassList,
  createHeadMock,
  createImageRequestMock,
  createJsonResponse,
  createQuotaLimitedStorageMock,
  createStorageMock,
  escapeRegex,
  expectIncludes,
  expectNoMalformedClosingTags,
  expectNotIncludes,
  extractContentSecurityPolicyMetaContent,
  loadBrowserScript,
  loadCommonJsModule,
  normalizeHtml,
  publicImageDnsLookup,
  read,
  runNotionBlockFixture,
  withEnvOverrides,
} from "./smoke-check/harness.mjs";

[
  "js/common.js",
  "js/blog-page.js",
  "js/bookmark.js",
  "js/font-loader.js",
  "js/app.js",
  "js/index-page.js",
  "js/notion-content-shared.js",
  "js/notion-content-utils.js",
  "js/notion-content-url.js",
  "js/notion-article-renderer.js",
  "js/notion-content.js",
  "js/notion-api.js",
  "js/post-page.js",
  "js/runtime-core.js",
  "js/seo-meta.js",
  "js/site-utils.js",
  "js/spa-router.js",
  "js/ui-effects.js",
  "scripts/inject-site-meta.mjs",
  "scripts/release-check.mjs",
  "api/notion.js",
  "api/image.js",
  "api/posts-data.js",
  "api/post-data.js",
  "api/post.js",
  "api/robots.js",
  "api/sitemap.js",
  "server/public-content.js",
  "server/security-policy.js",
  "server/notion-config.js",
  "server/category-navigation.js",
  "server/cache-store.js",
  "server/notion-client.js",
  "server/notion-schema.js",
  "server/public-policy.js",
  "server/block-service.js",
  "server/post-service.js",
  "server/render-service.js",
  "server/notion-server.js",
].forEach(checkSyntax);
const indexHtml = read("index.html");
const blogHtml = read("blog.html");
const postHtml = read("post.html");
const gitAttributes = read(".gitattributes");
const gitIgnore = read(".gitignore");
const kiroGitRules = read(".kiro/steering/git-rules.md");
const packageJson = read("package.json");
const readmeMd = read("README.md");
const siteArchitectureMd = read("SITE_ARCHITECTURE.md");
const siteConfigJson = read("site.config.json");
const siteConfig = JSON.parse(siteConfigJson);
const configuredSiteOrigin = normalizeConfiguredSiteOrigin(siteConfig.siteUrl);
const featuredCategoryName = siteConfig.categoryNavigation.featured.name;
const featuredCategoryHref = `/blog.html?category=${encodeURIComponent(featuredCategoryName)}`;
const vercelJson = read("vercel.json");
const envExample = read(".env.example");
const faviconPng = readFileSync("favicon.png");
const ogImageJpg = readFileSync("og-image.jpg");
const licenseText = read("LICENSE");
const localServerJs = read("scripts/local-server.mjs");
const releaseCheckJs = read("scripts/release-check.mjs");
const releaseCheckWorkflowYml = read(".github/workflows/release-check.yml");
const styleCss = read("css/style.css");
const blogPageCss = read("css/blog-page.css");
const postPageCss = read("css/post-page.css");
const commonJs = read("js/common.js");
const blogPageJs = read("js/blog-page.js");
const runtimeCoreJs = read("js/runtime-core.js");
const spaRouterJs = read("js/spa-router.js");
const bookmarkJs = read("js/bookmark.js");
const appJs = read("js/app.js");
const indexPageJs = read("js/index-page.js");
const notionContentSharedJs = read("js/notion-content-shared.js");
const notionContentUtilsJs = read("js/notion-content-utils.js");
const notionContentUrlJs = read("js/notion-content-url.js");
const notionArticleRendererJs = read("js/notion-article-renderer.js");
const notionContentJs = read("js/notion-content.js");
const notionApiJs = read("js/notion-api.js");
const postPageJs = read("js/post-page.js");
const siteUtilsJs = read("js/site-utils.js");
const smokeCheckSource = read("scripts/smoke-check.mjs");
const smokeCheckModuleSources = [
  read("scripts/smoke-check/api-contracts.mjs"),
  read("scripts/smoke-check/blog-page.mjs"),
  read("scripts/smoke-check/content-modules.mjs"),
  read("scripts/smoke-check/harness.mjs"),
  read("scripts/smoke-check/image-proxy.mjs"),
  read("scripts/smoke-check/mobile-layout.mjs"),
  read("scripts/smoke-check/notion-api-client.mjs"),
  read("scripts/smoke-check/public-content-notion.mjs"),
  read("scripts/smoke-check/routing-vercel.mjs"),
  read("scripts/smoke-check/server-modules.mjs"),
];
const visualRegressionJs = read("scripts/visual-regression.mjs");
const apiNotionJs = read("api/notion.js");
const apiImageJs = read("api/image.js");
const apiPostsDataJs = read("api/posts-data.js");
const apiPostDataJs = read("api/post-data.js");
const apiPostJs = read("api/post.js");
const apiRobotsJs = read("api/robots.js");
const apiSitemapJs = read("api/sitemap.js");
const publicContentJs = read("server/public-content.js");
const serverNotionConfigJs = read("server/notion-config.js");
const serverCategoryNavigationJs = read("server/category-navigation.js");
const serverCacheStoreJs = read("server/cache-store.js");
const serverNotionClientJs = read("server/notion-client.js");
const serverNotionSchemaJs = read("server/notion-schema.js");
const serverPublicPolicyJs = read("server/public-policy.js");
const serverBlockServiceJs = read("server/block-service.js");
const serverPostServiceJs = read("server/post-service.js");
const serverRenderServiceJs = read("server/render-service.js");
const serverNotionJs = read("server/notion-server.js");
const notionContentSharedHelpers = loadCommonJsModule("js/notion-content-shared.js");
const notionContentUtilsHelpers = loadCommonJsModule("js/notion-content-utils.js");
const notionContentUrlHelpers = loadCommonJsModule("js/notion-content-url.js");
const notionArticleRendererHelpers = loadCommonJsModule("js/notion-article-renderer.js");
const notionContentHelpers = loadCommonJsModule("js/notion-content.js");
const serverNotionConfigHelpers = loadCommonJsModule("server/notion-config.js");
const serverCategoryNavigationHelpers = loadCommonJsModule("server/category-navigation.js");
const serverCacheStoreHelpers = loadCommonJsModule("server/cache-store.js");
const publicContentHelpers = loadCommonJsModule("server/public-content.js");
const securityPolicyHelpers = loadCommonJsModule("server/security-policy.js");
const apiNotionHandler = loadCommonJsModule("api/notion.js");
const apiImageHandler = loadCommonJsModule("api/image.js");
const {
  __test: imageProxyDefaultConfig,
} = loadCommonJsModule("api/image.js", [
  "IMAGE_PROXY_TIMEOUT_MS",
  "IMAGE_PROXY_MAX_BYTES",
  "IMAGE_PROXY_MAX_REDIRECTS",
]);
const apiPostHandler = loadCommonJsModule("api/post.js");
const apiRobotsHandler = loadCommonJsModule("api/robots.js");
const apiPostsDataHandler = loadCommonJsModule("api/posts-data.js");
const apiPostDataHandler = loadCommonJsModule("api/post-data.js");
const {
  __test: apiPostHelpers,
} = loadCommonJsModule("api/post.js", [
  "buildInitialPostPayload",
  "upsertStructuredDataScript",
  "injectInitialPostData",
  "replaceContentSecurityPolicyMeta",
  "replacePostContent",
  "replaceHeadMeta",
  "replaceEmptyStateContent",
]);
const {
  __test: serverNotionHelpers,
} = loadCommonJsModule("server/notion-server.js", [
  "buildPostPayload",
  "buildArticleStructuredData",
  "buildPublicCategories",
  "buildContentSchema",
  "buildCategoryFilter",
  "buildCategoryPresentation",
  "buildDatabaseSorts",
  "buildPublicAccessPolicyFromDatabase",
  "decoratePostSummary",
  "filterPostsBySearch",
  "normalizePostQueryFilters",
  "renderPostContent",
]);

const assetVersionValue = "20260514-v50";
const assetVersion = `v=${assetVersionValue}`;
const defaultShareImagePath = "/og-image.jpg?v=4";
const productionDomainPattern = /0000068\.xyz/;
const allowedProductionDomainFiles = new Set([
  "FIX_TODO.md",
  "README.md",
  "SITE_ARCHITECTURE.md",
  "blog.html",
  "index.html",
  "post.html",
  "scripts/smoke-check.mjs",
  "site.config.json",
]);
const skippedScanDirectories = new Set([".git", ".vercel", "node_modules"]);
const skippedScanExtensions = new Set([".ico", ".jpeg", ".jpg", ".png", ".webp"]);

function toProjectPath(filePath) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

function listProjectTextFiles(directory = process.cwd()) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (skippedScanDirectories.has(entry.name)) {
      return [];
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listProjectTextFiles(absolutePath);
    }

    if (skippedScanExtensions.has(path.extname(entry.name).toLowerCase())) {
      return [];
    }

    return [toProjectPath(absolutePath)];
  });
}

function collectVersionedStaticAssetVersions(htmlSource) {
  return Array.from(
    String(htmlSource).matchAll(/\b(?:href|src)="\/(?:css|js)\/[^"]+\?v=([^"&]+)"/g),
    (match) => match[1],
  );
}

function normalizeConfiguredSiteOrigin(value) {
  const url = new URL(String(value || ""));
  assert.ok(["http:", "https:"].includes(url.protocol), "site.config.json siteUrl should use http or https");
  return url.origin;
}

function readJpegDimensions(buffer, label) {
  assert.equal(buffer[0], 0xff, `${label} should start with a JPEG SOI marker`);
  assert.equal(buffer[1], 0xd8, `${label} should start with a JPEG SOI marker`);
  let offset = 2;
  while (offset < buffer.length) {
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    const length = buffer.readUInt16BE(offset);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  assert.fail(`${label} should include JPEG dimensions`);
}

const productionDomainFiles = listProjectTextFiles().filter((filePath) => (
  productionDomainPattern.test(readFileSync(filePath, "utf8"))
));
assert.deepEqual(
  productionDomainFiles.filter((filePath) => !allowedProductionDomainFiles.has(filePath)),
  [],
  "production domain hardcoding should stay constrained to documented SEO fallback files",
);
assert.ok(!existsSync("robots.txt"), "robots.txt should be served dynamically through /api/robots");
assert.equal(siteConfig.siteUrl, configuredSiteOrigin, "site.config.json siteUrl should be a normalized origin without a trailing slash");
expectIncludes(serverNotionClientJs, "readConfiguredSiteOrigin(SITE_CONFIG)", "server site origin fallback should read site.config.json");
expectNotIncludes(serverNotionJs, "0000068.xyz", "server site origin fallback should not duplicate the production domain literal");
runServerModuleChecks({
  assert,
  expectIncludes,
  expectNotIncludes,
  serverBlockServiceJs,
  serverCacheStoreJs,
  serverCacheStoreHelpers,
  serverCategoryNavigationHelpers,
  serverCategoryNavigationJs,
  serverNotionClientJs,
  serverNotionConfigHelpers,
  serverNotionConfigJs,
  serverNotionJs,
  serverNotionSchemaJs,
  serverPostServiceJs,
  serverPublicPolicyJs,
  serverRenderServiceJs,
  siteArchitectureMd,
});
[
  ["index.html", indexHtml, "/"],
  ["blog.html", blogHtml, "/blog.html"],
  ["post.html", postHtml, "/post.html"],
].forEach(([label, htmlSource, routePath]) => {
  const expectedUrl = `${configuredSiteOrigin}${routePath}`;
  expectIncludes(htmlSource, `content="${expectedUrl}"`, `${label} should keep fallback og:url in sync with site.config.json`);
  expectIncludes(htmlSource, `href="${expectedUrl}"`, `${label} should keep fallback canonical in sync with site.config.json`);
  expectIncludes(htmlSource, `content="${configuredSiteOrigin}${defaultShareImagePath}"`, `${label} should keep fallback og:image in sync with site.config.json`);
});

expectIncludes(indexHtml, 'property="og:image"', "index.html should declare og:image");
expectIncludes(blogHtml, 'property="og:image"', "blog.html should declare og:image");
expectIncludes(postHtml, 'property="og:image"', "post.html should declare og:image");
[
  ["index.html", indexHtml],
  ["blog.html", blogHtml],
  ["post.html", postHtml],
].forEach(([label, htmlSource]) => {
  expectIncludes(htmlSource, 'type="image/png" href="/favicon.png?v=4"', `${label} should keep the approved PNG favicon artwork`);
  expectNotIncludes(htmlSource, "favicon.svg", `${label} should not let a mismatched SVG favicon override the approved PNG artwork`);
});
assert.equal(
  faviconPng.subarray(0, 8).toString("hex"),
  "89504e470d0a1a0a",
  "favicon.png should be a valid PNG asset",
);
assert.equal(faviconPng.readUInt32BE(16), 1024, "favicon.png should keep the approved 1024px source width");
assert.equal(faviconPng.readUInt32BE(20), 1024, "favicon.png should keep the approved 1024px source height");
assert.equal(
  createHash("sha256").update(faviconPng).digest("hex"),
  "048586722371a596ef02f4846dcaa2fc30d3f21853b8355e9de7fe10c40a15ba",
  "favicon.png should match the approved brand artwork",
);
assert.deepEqual(readJpegDimensions(ogImageJpg, "og-image.jpg"), { width: 1200, height: 630 }, "og-image.jpg should use the standard Open Graph image size");
assert.ok(ogImageJpg.length <= 80 * 1024, "og-image.jpg should stay at or below the 80KB Task D budget");
expectIncludes(indexHtml, 'id="heroSearchForm"', "index.html should expose a real search form");
expectIncludes(indexHtml, 'action="/blog.html"', "index.html search should degrade to a real blog route");
expectIncludes(indexHtml, 'method="get"', "index.html search should work without JavaScript");
expectIncludes(postHtml, 'rel="canonical"', "post.html should declare a fallback canonical link");
expectIncludes(postHtml, 'href="/blog.html"', "post.html should use root-relative blog links for canonical post routes");
expectIncludes(postHtml, 'class="empty-state-helper"', "post.html should keep empty-state helper styling in CSS classes");
expectIncludes(postHtml, 'class="empty-state-link"', "post.html should keep empty-state link styling in CSS classes");
expectIncludes(postHtml, `type="module" src="/js/app.js?${assetVersion}"`, "post.html should use the shared module entry for canonical post routes");
expectIncludes(postHtml, 'id="postStatus"', "post.html should expose a live status region for post interactions");
expectIncludes(blogHtml, 'href="/"', "blog.html should point the home action to the canonical root route");
expectIncludes(postHtml, 'href="/"', "post.html should point the home action to the canonical root route");
expectIncludes(indexHtml, 'href="/blog.html#bookmarks"', "index.html should keep bookmark navigation on a hash-only route");
expectIncludes(indexHtml, 'id="ctaHome" href="/blog.html" aria-label="总览"', "index hero overview CTA should expose an accessible name");
expectIncludes(indexHtml, `id="ctaStart" href="${featuredCategoryHref}" aria-label="${featuredCategoryName}"`, "index hero featured CTA should expose an accessible name from site.config.json");
expectIncludes(indexHtml, `<span class="btn-tooltip">${featuredCategoryName}</span>`, "index hero featured CTA tooltip should follow site.config.json");
expectIncludes(indexHtml, 'id="ctaWiki" href="/blog.html#bookmarks" rel="nofollow" aria-label="收藏"', "index hero bookmark CTA should expose an accessible name");
expectIncludes(blogHtml, 'href="/blog.html#bookmarks"', "blog.html should keep bookmark navigation on a hash-only route");
expectIncludes(postHtml, 'href="/blog.html#bookmarks"', "post.html should keep bookmark navigation on a hash-only route");
expectNotIncludes(blogHtml, 'href="/index.html"', "blog.html should avoid the duplicate /index.html home route");
expectNotIncludes(postHtml, 'href="/index.html"', "post.html should avoid the duplicate /index.html home route");
expectNotIncludes(indexHtml, '?category=%E6%94%B6%E8%97%8F', "index.html should avoid exposing bookmark query routes to crawlers");
expectNotIncludes(blogHtml, '?category=%E6%94%B6%E8%97%8F', "blog.html should avoid exposing bookmark query routes to crawlers");
expectNotIncludes(postHtml, '?category=%E6%94%B6%E8%97%8F', "post.html should avoid exposing bookmark query routes to crawlers");
const pageHtmlByLabel = [
  ["index.html", indexHtml],
  ["blog.html", blogHtml],
  ["post.html", postHtml],
];
const staticAssetVersions = new Set();
pageHtmlByLabel.forEach(([label, htmlSource]) => {
  const versions = collectVersionedStaticAssetVersions(htmlSource);
  assert.ok(versions.length > 0, `${label} should include versioned CSS/JS assets`);
  versions.forEach((version) => {
    staticAssetVersions.add(version);
    assert.equal(
      version,
      assetVersionValue,
      `${label} should use the shared static CSS/JS asset version`,
    );
  });
});
assert.equal(
  staticAssetVersions.size,
  1,
  "static CSS/JS assets should not carry multiple cache-busting versions",
);
const expectedStaticContentSecurityPolicy = securityPolicyHelpers.buildStaticContentSecurityPolicy();
expectIncludes(expectedStaticContentSecurityPolicy, "https://fonts.googleapis.com", "shared CSP should allow the global Google Fonts CSS endpoint");
expectIncludes(expectedStaticContentSecurityPolicy, "https://fonts.googleapis.cn", "shared CSP should keep the China Google Fonts CSS endpoint allowed");
expectIncludes(expectedStaticContentSecurityPolicy, "https://fonts.gstatic.com", "shared CSP should allow the global Google Fonts file endpoint");
expectIncludes(expectedStaticContentSecurityPolicy, "https://fonts.gstatic.cn", "shared CSP should keep the China Google Fonts file endpoint allowed");
expectIncludes(expectedStaticContentSecurityPolicy, "https://www.youtube.com", "shared CSP should allow YouTube embeds");
expectIncludes(expectedStaticContentSecurityPolicy, "https://player.bilibili.com", "shared CSP should allow Bilibili embeds");
expectIncludes(expectedStaticContentSecurityPolicy, "https://player.vimeo.com", "shared CSP should allow Vimeo embeds");
expectIncludes(expectedStaticContentSecurityPolicy, "https://codepen.io", "shared CSP should allow CodePen embeds");
expectIncludes(expectedStaticContentSecurityPolicy, "https://www.figma.com", "shared CSP should allow Figma embeds");
expectIncludes(expectedStaticContentSecurityPolicy, "https://www.loom.com", "shared CSP should allow Loom embeds");
expectNotIncludes(expectedStaticContentSecurityPolicy, "frame-src 'self' https:;", "shared CSP should not allow every HTTPS frame origin");
pageHtmlByLabel.forEach(([label, htmlSource]) => {
  assert.equal(
    extractContentSecurityPolicyMetaContent(htmlSource),
    expectedStaticContentSecurityPolicy,
    `${label} static CSP meta should match the shared security policy builder`,
  );
  expectIncludes(htmlSource, 'rel="preconnect" href="https://fonts.googleapis.com"', `${label} should preconnect to the global Google Fonts CSS endpoint`);
  expectIncludes(htmlSource, 'rel="preconnect" href="https://fonts.gstatic.com"', `${label} should preconnect to the global Google Fonts file endpoint`);
  expectIncludes(htmlSource, 'rel="preconnect" href="https://fonts.googleapis.cn"', `${label} should keep the China Google Fonts CSS preconnect`);
  expectIncludes(htmlSource, 'rel="preconnect" href="https://fonts.gstatic.cn"', `${label} should keep the China Google Fonts file preconnect`);

  expectIncludes(
    htmlSource,
    `<script type="module" src="/js/app.js?${assetVersion}" data-spa-runtime></script>`,
    `${label} should load the shared SPA runtime through one ES module entry`,
  );
  assert.equal(
    Array.from(htmlSource.matchAll(/<script\b[^>]*\bsrc="\/js\//g)).length,
    1,
    `${label} should avoid HTML script-order dependencies by using the module entry`,
  );
});
const expectedAppModuleImports = [
  "./font-loader.js",
  "./notion-content-shared.js",
  "./notion-content-utils.js",
  "./notion-content-url.js",
  "./notion-article-renderer.js",
  "./notion-content.js",
  "./runtime-core.js",
  "./site-utils.js",
  "./common.js",
  "./ui-effects.js",
  "./seo-meta.js",
  "./spa-router.js",
  "./notion-api.js",
  "./bookmark.js",
  "./index-page.js",
  "./blog-page.js",
  "./post-page.js",
];
const appModuleImports = Array.from(
  appJs.matchAll(/^import\s+"(\.\/[^"]+\.js)\?v=([^"]+)";$/gm),
);
assert.equal(
  appModuleImports.length,
  expectedAppModuleImports.length,
  "app.js should version every side-effect module import",
);
expectedAppModuleImports.reduce((previousIndex, src) => {
  const importStatement = `import "${src}?${assetVersion}";`;
  const nextIndex = appJs.indexOf(importStatement);
  assert.ok(nextIndex > previousIndex, `app.js should import ${src} after its dependencies with the shared asset version`);
  return nextIndex;
}, -1);
appModuleImports.forEach(([, src, version]) => {
  assert.ok(expectedAppModuleImports.includes(src), `app.js should not import unexpected module ${src}`);
  assert.equal(version, assetVersionValue, `${src} should use the shared asset version`);
});
expectNoMalformedClosingTags(indexHtml, "index.html should not contain malformed closing tags");
expectNoMalformedClosingTags(blogHtml, "blog.html should not contain malformed closing tags");
expectNoMalformedClosingTags(postHtml, "post.html should not contain malformed closing tags");
expectIncludes(indexHtml, "data-page-focus", "index.html should mark a focus target");
expectIncludes(blogHtml, "data-page-focus", "blog.html should mark a focus target");
expectIncludes(blogHtml, 'id="blogStatus"', "blog.html should include the live status region");
expectIncludes(blogHtml, 'id="blogGrid" role="list"', "blog grid should expose list semantics");
expectIncludes(blogHtml, 'type="search" id="blogSearch"', "blog search input should use the mobile-friendly search keyboard");
expectIncludes(indexHtml, `href="/css/style.css?${assetVersion}"`, "index.html should cache-bust shared CSS");
expectIncludes(blogHtml, `href="/css/blog-page.css?${assetVersion}"`, "blog.html should cache-bust blog-page.css");
expectIncludes(postHtml, `href="/css/post-page.css?${assetVersion}"`, "post.html should cache-bust post-page.css");
expectNotIncludes(packageJson, '"dev:bg"', "package.json should keep local dev scripts simple");
expectNotIncludes(readmeMd, "dev:bg", "README should not mention removed background dev scripts");
expectIncludes(gitAttributes, "*.mjs text eol=lf", ".gitattributes should normalize .mjs files to LF");
expectIncludes(gitIgnore, ".vscode/", ".gitignore should keep empty editor-local folders out of the repo");
expectIncludes(gitIgnore, "node_modules/", ".gitignore should keep local dependency folders out of the repo");
assert.ok(!styleCss.includes("\r\n"), "style.css should use LF line endings");
assert.ok(!blogPageCss.includes("\r\n"), "blog-page.css should use LF line endings");
assert.ok(!postPageCss.includes("\r\n"), "post-page.css should use LF line endings");
assert.ok(!smokeCheckSource.includes("\r\n"), "smoke-check.mjs should use LF line endings");
smokeCheckModuleSources.forEach((source, index) => {
  assert.ok(!source.includes("\r\n"), `smoke-check module ${index + 1} should use LF line endings`);
});
expectNotIncludes(styleCss, ".blog-grid {", "style.css should not ship the blog grid layout anymore");
expectNotIncludes(styleCss, ".post-content {", "style.css should not ship post content styles anymore");
expectNotIncludes(styleCss, ".fab-bookmark {", "style.css should not ship the floating post bookmark styles anymore");
expectIncludes(blogPageCss, ".blog-grid {", "blog-page.css should own the blog grid layout");
expectIncludes(postPageCss, ".post-content {", "post-page.css should own the post content styles");
expectIncludes(postPageCss, "overflow-wrap: anywhere;", "post content should break long URLs before they widen mobile layout");
expectIncludes(postPageCss, "word-break: break-word;", "post content should include legacy long-word wrapping fallback");
expectIncludes(postPageCss, ".empty-state-link", "post page CSS should own empty-state link styling");
expectIncludes(postPageCss, ".fab-bookmark {", "post-page.css should own the floating bookmark styles");
expectNotIncludes(postPageCss, "body[data-page=\"post\"] .fab-bookmark", "post-page CSS should not override bookmark visibility that JavaScript owns");
expectNotIncludes(postPageCss, "display: none !important", "post-page CSS should avoid forcing bookmark controls against JavaScript state");
expectIncludes(blogPageJs, "EAGER_COVER_IMAGE_COUNT = 3", "blog cards should prioritize the first visible cover images");
expectIncludes(blogPageJs, "MOBILE_EAGER_COVER_IMAGE_COUNT = 1", "blog cards should reduce eager cover loading on real mobile devices");
expectIncludes(blogPageJs, "MOBILE_PRELOAD_COVER_IMAGE_COUNT = 1", "blog cards should reduce image preloads on real mobile devices");
expectIncludes(blogPageJs, "mobileDeviceQuery.matches", "blog cards should gate mobile image policy through the shared mobile query");
expectIncludes(blogPageJs, "resolveSafeCoverImage(post)", "blog cards should use display-safe cover URLs instead of share-image fallbacks");
expectIncludes(blogPageJs, 'loading="${coverLoading}"', "blog cards should keep lazy loading off the first visible covers");
expectIncludes(blogPageJs, 'fetchpriority="${coverFetchPriority}"', "blog cards should assign browser fetch priority to cover images");
expectIncludes(blogPageJs, "preloadCoverImages(data.results)", "blog cards should preload the first visible cover images after list data arrives");
expectIncludes(blogPageJs, 'data-blog-cover-preload', "blog cards should mark temporary cover preload links for cleanup");
expectIncludes(blogPageJs, 'window.addEventListener?.("bookmarks:updated", handleBookmarksUpdated)', "blog page should listen for cross-tab bookmark updates");
expectNotIncludes(blogPageJs, "@canonical-source", "blog page should not keep dead local copies of shared helper fallbacks");
expectIncludes(blogPageJs, "const sanitizeCssColor = SHARED_CONTENT.sanitizeCssColorValue;", "blog page should call the shared CSS sanitizer directly");
expectIncludes(blogPageJs, "const normalizeBookmarkSearchQuery = SHARED_CONTENT.normalizeSearchText;", "blog page should call the shared search normalizer directly");
expectIncludes(blogPageJs, "const buildSharedPostSearchText = SHARED_CONTENT.buildPostSearchText;", "blog page should call the shared search text builder directly");
expectIncludes(blogPageJs, "const parseBookmarkListingHash = siteUtils.parseBookmarkListingHash;", "blog page should rely on the shared bookmark hash parser");
expectIncludes(blogPageJs, "const buildBookmarkListingUrl = siteUtils.buildBookmarkListingUrl;", "blog page should rely on the shared bookmark route builder");
expectIncludes(blogPageJs, "blog-card-cover-fallback", "blog cards should show a stable fallback while remote covers load");
expectNotIncludes(blogPageJs, ">${safeCoverEmoji}</span>", "blog cover fallback should not render the notebook emoji as visible placeholder text");
expectIncludes(blogPageCss, ".blog-card-cover-fallback", "blog card cover CSS should keep fallback art visible until the image paints");
expectNotIncludes(blogPageCss, "border-bottom: 1px solid var(--glass-border);", "blog card covers should not draw a bottom hairline under cover images");
expectIncludes(blogPageCss, "z-index: 2;\n  border-radius: inherit;", "blog card link layer should stay above cover media");
expectIncludes(blogPageCss, "pointer-events: none;\n}", "blog card cover media should not swallow clicks meant for the card link");
expectIncludes(blogPageCss, "z-index: 3;\n  display: inline-flex;", "blog card bookmark button should stay above the card link layer");
expectIncludes(commonJs, "DESKTOP_PARTICLE_COUNT = 350", "particle runtime should preserve the desktop particle density");
expectNotIncludes(commonJs, "MOBILE_PARTICLE_COUNT", "particle runtime should not keep a mobile particle profile after disabling mobile particles");
expectIncludes(commonJs, "return isMobileParticleViewport();", "particle runtime should disable particles on all real mobile pages");
expectIncludes(commonJs, "count: isMobile ? 0 : DESKTOP_PARTICLE_COUNT", "particle runtime should keep particles desktop-only");
expectIncludes(commonJs, "siteUtils.isMobileDeviceViewport", "particle runtime should use the shared real-mobile gate before changing density");
expectIncludes(commonJs, '(hover: none) and (pointer: coarse)', "particle fallback should avoid treating narrow desktop windows as mobile");
expectIncludes(commonJs, "bucketArrays[color] = [];", "particle buckets should grow densely instead of preallocating holey arrays");
expectNotIncludes(commonJs, "bucketArrays[color] = Array(particleCount)", "particle buckets should not allocate holey arrays for every color");
expectNotIncludes(commonJs, "function shouldReduceMotion", "particle runtime should not stop the old particle animation for reduced-motion settings");
expectNotIncludes(commonJs, "shouldReduceMobileParticles", "particle runtime should avoid reduced-motion gates in the particle loop");
expectNotIncludes(commonJs, "particlesPausedForScroll", "particle runtime should not keep mobile scroll-pause state after disabling mobile particles");
expectNotIncludes(commonJs, "pauseMobileParticlesDuringScroll", "particle runtime should not attach mobile scroll particle work");
expectIncludes(siteUtilsJs, 'MOBILE_DEVICE_QUERY = "(max-width: 768px) and (hover: none) and (pointer: coarse)"', "site utils should centralize the real-mobile device query");
expectIncludes(siteUtilsJs, 'MOBILE_DEVICE_CLASS = "is-mobile-device-viewport"', "site utils should expose a JS fallback class for mobile browsers with broken pointer media queries");
expectIncludes(siteUtilsJs, "hasTouchInput", "site utils should fall back to touch capability for Brave/vivo mobile detection");
expectIncludes(siteUtilsJs, "syncMobileDeviceViewportClass", "site utils should keep the mobile compatibility class in sync");
expectIncludes(siteUtilsJs, "createMobileDeviceQueryList", "site utils should expose a reusable mobile media query helper");
expectIncludes(styleCss, "@media (max-width: 768px) and (hover: none) and (pointer: coarse)", "shared mobile CSS should not affect narrow desktop windows");
expectIncludes(blogPageCss, "@media (max-width: 768px) and (hover: none) and (pointer: coarse)", "blog mobile CSS should not affect narrow desktop windows");
expectIncludes(postPageCss, "@media (max-width: 768px) and (hover: none) and (pointer: coarse)", "post mobile CSS should not affect narrow desktop windows");
expectIncludes(styleCss, "color-scheme: dark;", "shared CSS should tell browsers to render native chrome in dark mode");
expectIncludes(styleCss, "html {\n  background-color: var(--bg-base);", "shared CSS should paint the root canvas behind mobile browser safe areas");
expectIncludes(styleCss, "user-select: auto;", "body text should remain selectable by default");
expectIncludes(styleCss, ".hero-title {\n  font-family:", "shared CSS should keep the home hero title rule explicit");
expectIncludes(styleCss, "-webkit-user-select: none;\n  user-select: none;\n  background: linear-gradient", "home hero title should not create a text selection highlight while dragging");
expectIncludes(styleCss, "min-height: 100dvh;", "shared CSS should include dynamic viewport fallbacks for mobile browser chrome");
expectIncludes(blogPageCss, "min-height: 100dvh;", "blog page should include a dynamic viewport fallback");
expectIncludes(postPageCss, "min-height: 100dvh;", "post page should include a dynamic viewport fallback");
expectIncludes(indexHtml, '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />', "home page should opt into safe-area painting on mobile browsers");
expectIncludes(blogHtml, '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />', "blog page should opt into safe-area painting on mobile browsers");
expectIncludes(postHtml, '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />', "post page should opt into safe-area painting on mobile browsers");
expectIncludes(indexHtml, '<meta name="theme-color" content="#111528" />', "home page should advertise the mobile background color to mobile browsers");
expectIncludes(blogHtml, '<meta name="theme-color" content="#111528" />', "blog page should advertise the mobile background color to mobile browsers");
expectIncludes(postHtml, '<meta name="theme-color" content="#111528" />', "post page should advertise the mobile background color to mobile browsers");
expectNotIncludes(styleCss, "radial-gradient(1px 1px at 18% 24%", "mobile blog/post backgrounds should not reintroduce static star speckles");
expectIncludes(blogHtml, '<nav class="pagination" id="pagination" aria-label="文章分页"></nav>', "blog pagination should expose navigation semantics");
expectIncludes(blogPageJs, 'aria-current="page"', "blog pagination should expose the current page to assistive technology");
expectIncludes(styleCss, 'body[data-page="post"] .top-actions', "post mobile CSS should explicitly target the article dock");
expectIncludes(styleCss, 'html.is-mobile-device-viewport body[data-page="post"] .top-actions', "post mobile dock should also hide when the JS mobile compatibility class is active");
expectIncludes(blogPageCss, "html.is-mobile-device-viewport .blog-grid", "blog mobile grid should also apply through the JS mobile compatibility class");
runMobileLayoutChecks({ assert, blogPageCss, styleCss });
expectIncludes(postPageCss, 'html.is-mobile-device-viewport body[data-page="post"] .page-transition-wrapper', "post wrapper clamp should also apply through the JS mobile compatibility class");
expectIncludes(styleCss, "display: none;", "post mobile dock should be hidden for clean reading");
expectIncludes(postPageCss, 'body[data-page="post"] .page-transition-wrapper', "post mobile CSS should clamp article layout wrappers to the viewport");
expectIncludes(postPageJs, "siteUtils.isMobileDeviceViewport", "post page should hide article bookmark controls through the shared mobile compatibility check");
expectIncludes(styleCss, "@media (hover: none) and (pointer: coarse)", "cursor glow should be disabled only for touch-first pointers");
expectNotIncludes(styleCss, "@media (hover: none), (pointer: coarse)", "cursor glow touch fallback should not use a broad OR media query");
assert.ok(
  !/@media\s*\(max-width:\s*768px\)\s*\{/.test(`${styleCss}\n${blogPageCss}\n${postPageCss}`),
  "primary mobile CSS breakpoints should include the real-mobile pointer/hover gate",
);
expectIncludes(styleCss, "@media (max-width: 540px) {", "shared CSS may add narrow fallback refinements behind the mobile compatibility class");
expectNotIncludes(postPageJs, 'createMediaQueryList("(max-width: 768px)")', "post page should not treat narrow desktop windows as mobile");
expectIncludes(blogPageCss, "opacity 0.3s ease", "blog cards should use shorter reveal transitions on mobile");
expectIncludes(blogPageJs, 'window.scrollTo({ top: 0, behavior: "auto" });', "blog pagination should avoid smooth-scroll jank on mobile");
expectIncludes(notionApiJs, "POSTS_RESPONSE_CACHE_TTL", "notion client should keep a short in-memory list cache for fast returns");
expectIncludes(notionApiJs, "POST_SUMMARY_MEMORY_CACHE_LIMIT = 200", "notion client should bound browser-side post summary memory");
expectIncludes(notionApiJs, "rememberPostSummaryInMemory", "notion client should centralize post summary memory LRU updates");
expectIncludes(notionApiJs, "postSummaryMemoryCache.keys().next().value", "notion client should evict the oldest in-memory post summary");
expectNotIncludes(notionApiJs, "_searchText:", "notion client should not reintroduce derived search text into public summary objects");
expectNotIncludes(bookmarkJs, "_searchText:", "bookmark manager should not persist derived search text in localStorage");
expectIncludes(notionContentJs, "IMAGE_PROXY_PATH", "shared notion content should proxy remote display images through the same-origin image endpoint");
expectIncludes(apiImageJs, "IMAGE_PROXY_CACHE_CONTROL", "image proxy endpoint should cache successful image responses at the edge");
expectIncludes(apiImageJs, 'readPositiveEnvNumber("IMAGE_PROXY_TIMEOUT_MS", 10_000)', "image proxy timeout should be configurable while keeping its default");
expectIncludes(apiImageJs, 'readPositiveEnvNumber("IMAGE_PROXY_MAX_BYTES", 8 * 1024 * 1024)', "image proxy size limit should be configurable while keeping its default");
expectIncludes(apiImageJs, 'readNonNegativeEnvInteger("IMAGE_PROXY_MAX_REDIRECTS", 4)', "image proxy redirect limit should be configurable while keeping its default");
expectIncludes(packageJson, '"dev": "node scripts/local-server.mjs"', "package scripts should expose the local API-aware dev server");
expectIncludes(packageJson, '"notion:live-check": "node scripts/notion-live-check.mjs"', "package scripts should expose the optional live Notion integration check");
expectIncludes(packageJson, '"visual:check": "node scripts/visual-regression.mjs"', "package scripts should expose the browser visual regression check");
expectIncludes(packageJson, '"verify:release": "node scripts/release-check.mjs"', "package scripts should expose the strict release check");
expectIncludes(packageJson, '"license": "MIT"', "package metadata should match the published README license");
expectIncludes(packageJson, '"version": "4.7.0"', "package version should match the next release commit");
expectIncludes(releaseCheckJs, "Promise.all([", "release check should run smoke and strict visual checks in parallel");
expectIncludes(releaseCheckJs, 'runNpmScript("check", {}, stopSiblingsAfterFailure)', "release check should keep the smoke suite in the strict gate");
expectIncludes(releaseCheckJs, 'runNpmScript("visual:check", { VISUAL_STRICT: "1" }, stopSiblingsAfterFailure)', "release check should run visual regression in strict mode");
expectIncludes(releaseCheckJs, "stopSiblingsAfterFailure", "release check should stop the sibling task after an early failure");
expectIncludes(releaseCheckJs, 'stopRunningChildren("SIGTERM")', "release check should terminate sibling tasks with SIGTERM after a failed child");
expectIncludes(releaseCheckJs, "firstFailureResult || results.find", "release check should report the original failing child instead of a sibling killed during cleanup");
expectNotIncludes(releaseCheckJs, "spawnSync", "release check should not serialize smoke and visual checks through spawnSync");
expectIncludes(releaseCheckWorkflowYml, "concurrency:", "release workflow should cancel stale runs for the same ref");
expectIncludes(releaseCheckWorkflowYml, "cancel-in-progress: true", "release workflow should cancel in-progress stale runs");
expectIncludes(releaseCheckWorkflowYml, "timeout-minutes: 10", "release workflow should bound CI runtime");
expectIncludes(packageJson, '"node": ">=22"', "package engines should require an active LTS Node runtime");
expectIncludes(readmeMd, "node-%3E%3D22", "README badge should advertise the supported Node engine floor");
expectIncludes(readmeMd, "Node.js](https://nodejs.org/) ≥ 22", "README prerequisites should match package engines");
expectIncludes(siteArchitectureMd, "Node 22/24 matrix", "architecture docs should describe the current release-check Node matrix");
expectIncludes(releaseCheckWorkflowYml, "node-version: [22, 24]", "release workflow should test the supported Node engine range");
expectNotIncludes(releaseCheckWorkflowYml, "node-version: [18, 20, 22]", "release workflow should drop EOL Node versions");
expectIncludes(releaseCheckWorkflowYml, "node-version: ${{ matrix.node-version }}", "release workflow should use the Node matrix value");
expectNotIncludes(releaseCheckWorkflowYml, 'node-version: "20"', "release workflow should not pin checks to Node 20 only");
expectNotIncludes(releaseCheckWorkflowYml, "master", "release workflow should not keep a dead master branch trigger");
expectIncludes(localServerJs, "await loadDotEnvFile();", "local server should load .env before reading runtime configuration");
expectIncludes(localServerJs, "Object.prototype.hasOwnProperty.call(process.env, parsed.key)", "local server should not override shell-provided environment variables with .env values");
expectIncludes(localServerJs, '["/api/robots", "../api/robots.js"]', "local server should expose the dynamic robots handler");
expectIncludes(localServerJs, "function getApiHandler", "local server should lazy-load API handlers by route");
expectNotIncludes(localServerJs, '["/api/post", require("../api/post.js")]', "local server should not eager-load every API handler at startup");
expectIncludes(localServerJs, "function isDeniedStaticPath", "local server should centralize static denylist checks");
expectIncludes(localServerJs, 'new Set(["api", "server", "scripts"])', "local server should deny source directories from static serving");
expectIncludes(localServerJs, 'segment.startsWith(".")', "local server should deny dotfiles including .env and .git paths");
expectIncludes(localServerJs, 'url.pathname === "/robots.txt"', "local server should map robots.txt to the dynamic handler");
expectIncludes(localServerJs, "VISUAL_REGRESSION_STATIC_TEMPLATES", "local server should expose static templates only for visual regression");
expectIncludes(visualRegressionJs, "Page.captureScreenshot", "visual regression should capture real browser screenshots");
expectIncludes(visualRegressionJs, "Emulation.setDeviceMetricsOverride", "visual regression should emulate mobile and desktop viewports");
expectIncludes(visualRegressionJs, "is-mobile-device-viewport", "visual regression should verify the mobile compatibility class");
expectIncludes(visualRegressionJs, "desktop particles should remain animated", "visual regression should guard desktop particle animation");
expectIncludes(visualRegressionJs, "mobile home particles should be disabled", "visual regression should guard mobile home particle removal");
expectIncludes(visualRegressionJs, "mobile blog bookmark button should compute to 26px width", "visual regression should guard mobile card bookmark sizing");
expectIncludes(visualRegressionJs, "mobile post top dock should stay hidden", "visual regression should guard mobile article dock visibility");
expectIncludes(readmeMd, "badge/version-4.7.0", "README badge should match package version");
expectIncludes(readmeMd, "npm.cmd run visual:check", "README should document the browser visual regression check");
expectIncludes(readmeMd, "VISUAL_STRICT=1", "README should document strict visual regression mode");
expectIncludes(readmeMd, "npm test` 与 `npm.cmd run check` 等价", "README should document that npm test stays a fast smoke check");
expectIncludes(readmeMd, "并行运行 smoke suite 和 `VISUAL_STRICT=1`", "README should document parallel strict release checks");
expectIncludes(siteArchitectureMd, "> Version: v4.6", "architecture docs should match the next release commit");
expectIncludes(siteArchitectureMd, "Version v4.6 Highlights", "architecture docs should describe the current release");
expectIncludes(readmeMd, "SITE_URL=https://your-domain.example", "README should use the same SITE_URL placeholder as .env.example");
expectIncludes(readmeMd, "IMAGE_PROXY_TIMEOUT_MS=10000", "README should document image proxy timeout tuning");
expectIncludes(readmeMd, "IMAGE_PROXY_MAX_BYTES=8388608", "README should document image proxy size tuning");
expectIncludes(readmeMd, "IMAGE_PROXY_MAX_REDIRECTS=4", "README should document image proxy redirect tuning");
expectIncludes(envExample, "whole configured Notion database is public", ".env.example should document database-wide public mode");
expectIncludes(envExample, "IMAGE_PROXY_TIMEOUT_MS=10000", ".env.example should expose image proxy timeout tuning");
expectIncludes(envExample, "IMAGE_PROXY_MAX_BYTES=8388608", ".env.example should expose image proxy size tuning");
expectIncludes(envExample, "IMAGE_PROXY_MAX_REDIRECTS=4", ".env.example should expose image proxy redirect tuning");
expectNotIncludes(envExample, "NOTION_PUBLIC_PROPERTY_NAMES", ".env.example should not encourage field-based public filtering");
expectIncludes(licenseText, "MIT License", "repository should include the LICENSE file referenced by README.md");
expectIncludes(kiroGitRules, "inclusion: always", "Kiro steering should always apply release commit rules");
expectIncludes(kiroGitRules, "vMAJOR.MINOR", "Kiro steering should mirror the version-only release commit convention");
expectIncludes(siteArchitectureMd, ".kiro/steering/git-rules.md", "architecture docs should point to the Kiro steering release rules");
expectIncludes(siteArchitectureMd, "Do not add a catch-all `/api/*` `Cache-Control` header", "architecture docs should warn against API-wide cache headers");
expectIncludes(siteArchitectureMd, "up to 200 post summaries in memory", "architecture docs should describe the bounded summary memory cache");
expectIncludes(siteArchitectureMd, "`blog-page.js` owns the `hashchange` flow for `/blog.html#bookmarks`", "architecture docs should document hash-only bookmark routing ownership");
expectIncludes(siteArchitectureMd, "`scripts/smoke-check.mjs` is the single `npm.cmd run check` entrypoint", "architecture docs should describe the smoke-check entrypoint");
expectIncludes(siteArchitectureMd, "`image-proxy.mjs` for `/api/image`", "architecture docs should list focused smoke-check modules");
expectIncludes(siteArchitectureMd, "`visual-regression.mjs` for real-browser screenshot checks", "architecture docs should describe the visual regression script");
expectIncludes(siteArchitectureMd, "VISUAL_STRICT=1", "architecture docs should document strict visual regression mode");
expectIncludes(readmeMd, "/api/robots", "README should document the dynamic robots endpoint");
expectIncludes(siteArchitectureMd, "| `/api/robots` | `GET` | Dynamic robots.txt |", "architecture docs should document the dynamic robots endpoint");
expectNotIncludes(
  siteArchitectureMd,
  "Add conservative length caps for public `category` and `search` query inputs",
  "architecture backlog should not list query length caps that are already implemented",
);
expectNotIncludes(
  siteArchitectureMd,
  "Bound the browser-side post summary memory maps",
  "architecture backlog should not list the now-bounded browser-side summary maps",
);
expectNotIncludes(
  siteArchitectureMd,
  "Split `scripts/smoke-check.mjs` into focused test modules",
  "architecture backlog should not list the now-split smoke check structure",
);
expectNotIncludes(
  siteArchitectureMd,
  "Convert the central `notion-content.js` block-type switch",
  "architecture backlog should not list the now-registered block renderer structure",
);
expectIncludes(localServerJs, '["/api/image", "../api/image.js"]', "local dev server should route the image proxy endpoint");
expectIncludes(localServerJs, '["/api/notion", "../api/notion.js"]', "local dev server should route the disabled legacy Notion proxy");
expectIncludes(localServerJs, '[".webp", "image/webp"]', "local dev server should serve WebP images with the correct MIME type");
expectIncludes(localServerJs, '[".jpg", "image/jpeg"]', "local dev server should serve JPEG images with the correct MIME type");
expectIncludes(localServerJs, '[".jpeg", "image/jpeg"]', "local dev server should serve JPEG images with the correct MIME type");
expectIncludes(localServerJs, '[".ico", "image/x-icon"]', "local dev server should serve icons with the correct MIME type");
expectIncludes(localServerJs, '[".svg", "image/svg+xml; charset=utf-8"]', "local dev server should serve SVG assets with the correct MIME type");
expectIncludes(localServerJs, '[".xml", "application/xml; charset=utf-8"]', "local dev server should serve XML with the correct MIME type");
expectIncludes(localServerJs, '[".mjs", "application/javascript; charset=utf-8"]', "local dev server should serve ESM scripts with the correct MIME type");
expectIncludes(localServerJs, "path.relative(rootDir, filePath)", "local dev server should validate static paths by relative containment");
expectIncludes(localServerJs, "path.isAbsolute(relativePath)", "local dev server should reject absolute relative paths after static path resolution");
expectIncludes(localServerJs, "isMissingStaticFileError", "local dev server should distinguish missing static files from server errors");
expectIncludes(localServerJs, "getErrorStatusCode", "local dev server should preserve API error status codes instead of converting everything to 404");
expectIncludes(localServerJs, "statusCode >= 500", "local dev server should log unexpected local request failures");
expectIncludes(spaRouterJs, 'script[src]:not([data-spa-runtime])', "SPA router should skip shared runtime scripts via HTML metadata");
expectIncludes(spaRouterJs, "StructuredData?.syncFromDocument", "SPA router should carry SSR JSON-LD into the active document during navigation");
expectIncludes(spaRouterJs, "waitForRouteExitCue", "SPA router should preserve the v1.6-style route exit cue");
expectIncludes(spaRouterJs, "ROUTE_EXIT_CUE_MS = 150", "SPA router should keep the old quick route exit pause");
expectIncludes(spaRouterJs, "ROUTE_LOCAL_POST_FALLBACK_MS", "SPA router should quickly recover local post route stalls");
expectIncludes(spaRouterJs, "ROUTE_STUCK_FALLBACK_MS", "SPA router should recover if a route transition gets stuck in the exit state");
expectIncludes(spaRouterJs, "getNavigationFallbackUrl", "SPA router stuck fallback should use local-compatible post URLs");
expectIncludes(spaRouterJs, "pendingPageFetches", "SPA router should coalesce in-flight page HTML prefetch and navigation requests");
expectIncludes(spaRouterJs, "MAX_PENDING_PAGE_FETCHES = 4", "SPA router should cap concurrent cacheable page fetches");
expectIncludes(spaRouterJs, "pendingPageFetches.size >= MAX_PENDING_PAGE_FETCHES", "SPA router should skip new warm prefetches once pending fetches are saturated");
expectIncludes(spaRouterJs, "buildPostTemplateFallbackUrl", "SPA router should recover post navigation when the local server lacks /posts rewrites");
expectIncludes(spaRouterJs, "shouldUsePostTemplateFallbackFirst", "SPA router should prefer the static post template on local dev origins");
expectIncludes(spaRouterJs, '"127.0.0.1"', "SPA router local post template preference should cover the bundled local server host");
expectIncludes(spaRouterJs, 'templateUrl.searchParams.set("id", postId);', "SPA router post fallback should load the static post template with the target id");
expectIncludes(spaRouterJs, "ROUTE_ENTER_TRANSITION", "SPA router should keep a visible route enter animation after cache hits");
expectIncludes(spaRouterJs, 'ROUTE_EXIT_TRANSITION = "opacity 0.15s ease, transform 0.15s ease"', "SPA router should keep the old quick route exit cadence");
expectIncludes(spaRouterJs, 'ROUTE_ENTER_START_TRANSFORM = "translateY(12px)"', "SPA router should keep the old light route entry slide");
expectIncludes(spaRouterJs, 'element.style.animation = "none"', "SPA router should suppress nested first-load animations during SPA route swaps");
expectNotIncludes(spaRouterJs, "ROUTE_ENTER_CLASS", "SPA router should keep v1.6-style whole-page route motion instead of layered route classes");
expectNotIncludes(styleCss, "spa-layer-rise", "style.css should not ship layered route-entry animation when using the v1.6-style transition");
expectNotIncludes(blogPageCss, "spa-route-entering", "blog-page.css should not add layered route-entry animations over the v1.6-style transition");
expectNotIncludes(postPageCss, "spa-route-entering", "post-page.css should not add layered route-entry animations over the v1.6-style transition");
expectNotIncludes(styleCss, "prefers-reduced-motion: reduce", "CSS should not weaken the old route and ambient motion");
expectIncludes(spaRouterJs, "pointerEvents = \"none\"", "SPA router should avoid interactions during route transitions");
assert.ok(
  !spaRouterJs.includes("SHARED_RUNTIME_SCRIPT_NAMES"),
  "SPA router should not hardcode the shared runtime script list",
);

const siteUtilsHarness = loadBrowserScript("js/site-utils.js", {
  window: {
    location: new URL("https://example.com/blog.html?category=Tech"),
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
    NotionContent: {
      resolveDisplayImageUrl: (value, baseOrigin) => {
        if (!value || typeof value !== "string") return null;
        const parsed = new URL(value, baseOrigin);
        return parsed.protocol === "https:" || parsed.origin === new URL(baseOrigin).origin
          ? parsed.href
          : null;
      },
      resolveProxiedDisplayImageUrl: (value, baseOrigin) => {
        if (!value || typeof value !== "string") return null;
        const parsed = new URL(value, baseOrigin);
        if (parsed.origin === new URL(baseOrigin).origin) return parsed.href;
        const proxyUrl = new URL("/api/image", baseOrigin);
        proxyUrl.searchParams.set("src", parsed.href);
        return proxyUrl.href;
      },
    },
  },
  document: {
    referrer: "https://example.com/blog.html?page=2",
  },
});
assert.equal(
  siteUtilsHarness.window.SiteUtils.buildPostPath("post 1"),
  "/posts/post%201",
  "SiteUtils should centralize canonical post-path generation",
);
const parsedBookmarkHash = siteUtilsHarness.window.SiteUtils.parseBookmarkListingHash(
  "#bookmarks?search=Alpha&page=2",
);
assert.equal(parsedBookmarkHash.active, true, "SiteUtils should detect bookmark hash routes");
assert.equal(parsedBookmarkHash.search, "Alpha", "SiteUtils should recover bookmark hash search state");
assert.equal(parsedBookmarkHash.page, 2, "SiteUtils should recover bookmark hash page state");
assert.equal(
  parsedBookmarkHash.normalizedHash,
  "#bookmarks?search=Alpha&page=2",
  "SiteUtils should emit canonical bookmark hash routes",
);
assert.equal(
  siteUtilsHarness.window.SiteUtils.resolveShareImageUrl(
    "https://assets.example.com/image.png?X-Amz-Algorithm=test",
    "https://example.com/fallback.png",
  ),
  "https://example.com/fallback.png",
  "SiteUtils should drop expiring share-image URLs in favor of stable fallbacks",
);
assert.equal(
  siteUtilsHarness.window.SiteUtils.sanitizeImageUrl("http://cdn.example.com/cover.png"),
  null,
  "SiteUtils should reject external http images through the shared renderer path",
);
assert.equal(
  siteUtilsHarness.window.SiteUtils.sanitizeImageUrl("/cover.png"),
  "https://example.com/cover.png",
  "SiteUtils should keep same-origin image URLs through the shared renderer path",
);
assert.equal(
  siteUtilsHarness.window.SiteUtils.resolveProxiedDisplayImageUrl("https://assets.example.com/cover.png"),
  "https://example.com/api/image?src=https%3A%2F%2Fassets.example.com%2Fcover.png",
  "SiteUtils should expose the shared proxied display image resolver",
);
const siteUtilsFallbackHarness = loadBrowserScript("js/site-utils.js", {
  window: {
    location: new URL("https://example.com/blog.html"),
  },
  document: {
    referrer: "",
  },
});
assert.equal(
  siteUtilsFallbackHarness.window.SiteUtils.sanitizeImageUrl("http://cdn.example.com/cover.png"),
  null,
  "SiteUtils fallback should reject external http images that production CSP blocks",
);
assert.equal(
  siteUtilsFallbackHarness.window.SiteUtils.sanitizeImageUrl("https://cdn.example.com/cover.png"),
  "https://cdn.example.com/cover.png",
  "SiteUtils fallback should allow external https images",
);
assert.equal(
  siteUtilsFallbackHarness.window.SiteUtils.sanitizeImageUrl("/cover.png"),
  "https://example.com/cover.png",
  "SiteUtils fallback should allow same-origin images",
);
assert.equal(
  siteUtilsHarness.window.SiteUtils.getPreferredBlogReturnUrl(),
  "https://example.com/blog.html?category=Tech",
  "SiteUtils should remember the most recent blog listing URL",
);

const seoHead = createHeadMock();
const descriptionMeta = new FakeElement();
descriptionMeta.tagName = "meta";
descriptionMeta.setAttribute("name", "description");
descriptionMeta.content = "Initial description";
seoHead.appendChild(descriptionMeta);
const initialOgUrlMeta = new FakeElement();
initialOgUrlMeta.tagName = "meta";
initialOgUrlMeta.setAttribute("property", "og:url");
initialOgUrlMeta.content = "https://example.com/blog.html";
seoHead.appendChild(initialOgUrlMeta);
const initialCanonicalLink = new FakeElement();
initialCanonicalLink.tagName = "link";
initialCanonicalLink.setAttribute("rel", "canonical");
initialCanonicalLink.href = "https://example.com/blog.html";
seoHead.appendChild(initialCanonicalLink);
const seoDocument = {
  title: "Original title",
  head: seoHead,
  querySelector(selector) {
    return seoHead.querySelector(selector);
  },
  createElement(tagName) {
    const element = new FakeElement();
    element.tagName = String(tagName).toLowerCase();
    return element;
  },
};
const seoHarness = loadBrowserScript("js/seo-meta.js", {
  window: {
    location: new URL("https://example.com/blog.html?utm_source=test"),
    SiteUtils: {
      resolveShareImageUrl: (candidate, fallback) => candidate || fallback,
    },
  },
  document: seoDocument,
});
assert.equal(
  seoHead.querySelector('meta[property="og:url"]').content,
  "https://example.com/blog.html",
  "SEO runtime should preserve existing og:url during initialization instead of copying tracking query parameters",
);
seoHarness.window.updateSeoMeta({
  title: "Updated article title",
  description: "Updated description",
  canonicalUrl: "https://example.com/posts/post-1#fragment",
  robots: "index, follow",
});
assert.equal(seoHarness.document.title, "Updated article title", "SEO runtime should update document.title");
assert.equal(
  seoHead.querySelector('meta[name="description"]').content,
  "Updated description",
  "SEO runtime should update the meta description",
);
assert.equal(
  seoHead.querySelector('link[rel="canonical"]').href,
  "https://example.com/posts/post-1",
  "SEO runtime should strip hashes from the canonical URL",
);
assert.equal(
  seoHead.querySelector('meta[name="robots"]').content,
  "index, follow",
  "SEO runtime should set robots metadata when requested",
);
seoHarness.window.updateSeoMeta({ robots: null });
assert.equal(
  seoHead.querySelector('meta[name="robots"]'),
  null,
  "SEO runtime should remove robots metadata when callers clear it",
);

const routerReplaceCalls = [];
const routerHarness = loadBrowserScript("js/spa-router.js", {
  window: {
    location: new URL("https://example.com/index.html"),
    history: {
      pushState: () => {},
      replaceState(state, title, nextUrl) {
        routerReplaceCalls.push(String(nextUrl));
      },
    },
    PageProgress: {
      start() {},
      finish() {},
    },
    PageRuntime: {
      getPageIdFromUrl: () => null,
      initializePage: () => null,
      cleanupCurrentPage: () => {},
      register: () => {},
    },
  },
  document: {
    head: {
      appendChild: () => null,
    },
    scripts: [],
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  },
  globals: {
    navigator: {
      connection: null,
    },
    Element: class {},
    HTMLLinkElement: class {},
    DOMParser: class {},
  },
});
assert.equal(
  routerReplaceCalls.at(-1),
  "https://example.com/",
  "SPA router should canonicalize the duplicate /index.html route on boot",
);
assert.equal(
  typeof routerHarness.window.SPARouter?.navigate,
  "function",
  "SPA router should expose a navigate() API",
);

expectIncludes(runtimeCoreJs, 'application/ld+json', "runtime-core.js should own structured data script management");
expectIncludes(runtimeCoreJs, "readStructuredDataNonce", "runtime-core.js should preserve a request nonce on JSON-LD nodes when one is available");
expectIncludes(runtimeCoreJs, "if (nonce)", "runtime-core.js should not require a nonce before restoring SPA JSON-LD");
expectIncludes(runtimeCoreJs, "syncStructuredDataFromDocument", "runtime-core.js should preserve fetched SSR JSON-LD during SPA swaps");
expectIncludes(runtimeCoreJs, "syncFromDocument", "runtime-core.js should expose structured-data document syncing");
expectIncludes(runtimeCoreJs, "document.head?.querySelector", "runtime-core.js should only trust nonce-bearing scripts already present in the active document head");
expectIncludes(runtimeCoreJs, 'script.setAttribute("nonce", nonce)', "runtime-core.js should preserve CSP nonce protection for runtime JSON-LD updates");
expectIncludes(runtimeCoreJs, "page-progress", "runtime-core.js should wire the shared page progress bar");
expectIncludes(runtimeCoreJs, "focusSpaContent", "runtime-core.js should expose SPA focus management");
expectIncludes(runtimeCoreJs, "cleanupTemporaryFocus", "runtime-core.js should clean up temporary SPA focus tabindex attributes");
expectIncludes(runtimeCoreJs, 'removeAttribute("tabindex")', "runtime-core.js should remove managed tabindex after programmatic focus");
expectIncludes(runtimeCoreJs, "const PageRuntime = (() => {", "runtime-core.js should own page module registration and cleanup");
expectIncludes(runtimeCoreJs, "function start(pageId = getPageIdFromUrl(window.location.href))", "runtime-core.js should split page registration from initial startup");
expectNotIncludes(runtimeCoreJs, "if (pageId === getPageIdFromUrl(window.location.href))", "PageRuntime.register should not initialize pages during module import");
expectIncludes(appJs, "window.PageRuntime?.start?.();", "app.js should start the current page after all page modules register");
expectIncludes(bookmarkJs, "parseSerializedTags", "bookmark fallback should recover serialized tags");
expectIncludes(bookmarkJs, "createBookmarkEntry", "bookmark manager should centralize bookmark record creation");
expectIncludes(bookmarkJs, "buildCardBookmarkSource", "bookmark manager should centralize DOM snapshot extraction");
expectIncludes(bookmarkJs, "hydrateMissingMetadata", "bookmark manager should hydrate legacy metadata");
expectIncludes(bookmarkJs, "BOOKMARK_METADATA_VERSION = 4", "bookmark metadata should upgrade when persistence rules change");
expectIncludes(bookmarkJs, "resolveDisplayImageUrl", "bookmark normalization should preserve displayable cover images");
expectIncludes(bookmarkJs, "coverPlaceholder?.dataset?.coverGradient", "bookmark DOM fallback should preserve card gradients");
expectIncludes(bookmarkJs, "coverPlaceholder?.dataset?.coverEmoji", "bookmark DOM fallback should preserve card emojis");
expectIncludes(bookmarkJs, "return false;", "bookmark save should fail explicitly when persistence is unavailable");
expectIncludes(bookmarkJs, "if (!save(bookmarks)) return null;", "bookmark toggles should abort when persistence fails");
expectIncludes(bookmarkJs, "if (!save(nextBookmarks))", "bookmark hydration should fail cleanly when persistence is unavailable");
expectIncludes(bookmarkJs, "return null;", "bookmark toggleById should signal persistence failures");
expectIncludes(bookmarkJs, 'new window.CustomEvent("bookmarks:updated"', "bookmark manager should broadcast storage-driven bookmark updates");
expectIncludes(bookmarkJs, 'if (typeof window.CustomEvent !== "function") return;', "bookmark manager should require real CustomEvent support instead of dispatching plain objects");
expectNotIncludes(bookmarkJs, 'type: "bookmarks:updated", detail', "bookmark manager should not keep the invalid plain-object event fallback");
expectIncludes(bookmarkJs, "clearTimeout(storageSyncTimer);", "bookmark storage sync should debounce cross-tab updates");
expectIncludes(bookmarkJs, "}, 100);", "bookmark storage sync should use the Task F debounce window");
runContentModuleChecks({
  assert,
  expectIncludes,
  expectNotIncludes,
  notionArticleRendererHelpers,
  notionArticleRendererJs,
  notionContentHelpers,
  notionContentJs,
  notionContentSharedHelpers,
  notionContentSharedJs,
  notionContentUrlHelpers,
  notionContentUrlJs,
  notionContentUtilsHelpers,
  notionContentUtilsJs,
  postPageCss,
  siteArchitectureMd,
});
assert.equal(
  notionContentHelpers.resolveDisplayImageUrl("http://cdn.example.com/cover.png", "https://example.com"),
  null,
  "shared notion content helpers should reject external http images that production CSP would block",
);
assert.equal(
  notionContentHelpers.resolveDisplayImageUrl("/cover.png", "http://localhost:3000"),
  "http://localhost:3000/cover.png",
  "shared notion content helpers should still allow same-origin local image URLs",
);
assert.equal(
  notionContentHelpers.resolveProxiedDisplayImageUrl("/cover.png", "https://example.com"),
  "https://example.com/cover.png",
  "shared notion content helpers should keep same-origin display images direct",
);
const proxiedDisplayImageUrl = new URL(
  notionContentHelpers.resolveProxiedDisplayImageUrl("https://assets.example.com/cover.png?token=1", "https://example.com"),
);
assert.equal(
  proxiedDisplayImageUrl.origin,
  "https://example.com",
  "shared notion content helpers should keep proxied image URLs same-origin",
);
assert.equal(
  proxiedDisplayImageUrl.pathname,
  "/api/image",
  "shared notion content helpers should send remote display images through the image proxy path",
);
assert.equal(
  proxiedDisplayImageUrl.searchParams.get("src"),
  "https://assets.example.com/cover.png?token=1",
  "shared notion content helpers should preserve the upstream remote image URL inside the proxy query",
);
notionBlockFixtures.forEach((fixture) => runNotionBlockFixture(fixture, notionContentHelpers));
const renderedArticleHtml = normalizeHtml(notionContentHelpers.renderPostArticle({
  title: "Shared shell",
  category: "Tech",
  date: "2026-04-11",
  readTime: "5 min",
  tags: ["TypeScript"],
  content: [{ type: "paragraph", text: "Body copy" }],
}, {
  baseOrigin: FIXTURE_BASE_ORIGIN,
}));
expectIncludes(renderedArticleHtml, '<div class="post-header">', "shared notion content module should render the reusable article shell");
expectIncludes(renderedArticleHtml, '<div class="post-content"><p>Body copy</p></div>', "shared notion content module should render article content through the shared shell");
const minimalArticleHtml = normalizeHtml(notionContentHelpers.renderPostArticle({
  title: "Minimal shell",
  category: "",
  date: "",
  readTime: "",
  tags: [],
  content: [],
}, {
  baseOrigin: FIXTURE_BASE_ORIGIN,
}));
assert.ok(
  !minimalArticleHtml.includes('class="post-category"'),
  "shared notion content module should hide the category badge when a post has no category",
);
assert.ok(
  !minimalArticleHtml.includes('class="post-meta"'),
  "shared notion content module should omit empty metadata rows when a post has no date, read time, or tags",
);
const renderedImagePriorityHtml = normalizeHtml(notionContentHelpers.renderBlocks([
  {
    type: "image",
    url: "https://example.com/first.png",
    caption: "First image",
  },
  {
    type: "image",
    url: "https://example.com/second.png",
    caption: "Second image",
  },
], {
  baseOrigin: FIXTURE_BASE_ORIGIN,
}));
expectIncludes(
  renderedImagePriorityHtml,
  'src="https://example.com/first.png" alt="First image" loading="eager" decoding="async" fetchpriority="high"',
  "shared notion content module should prioritize the first article image for cover-like first paint",
);
expectIncludes(
  renderedImagePriorityHtml,
  'src="https://example.com/second.png" alt="Second image" loading="lazy" decoding="async"',
  "shared notion content module should keep later article images lazy",
);
const renderedEmbedHtml = normalizeHtml(notionContentHelpers.renderBlocks([{
  type: "resource",
  resourceType: "embed",
  url: "https://www.youtube.com/watch?v=video123",
  caption: "",
  captionHtml: "",
  name: "",
}], {
  baseOrigin: FIXTURE_BASE_ORIGIN,
}));
expectIncludes(renderedEmbedHtml, 'class="post-embed"', "shared notion content module should render embeds without the generic resource card shell");
expectIncludes(renderedEmbedHtml, 'class="post-embed-frame"', "shared notion content module should render embed resources as iframe shells");
expectIncludes(renderedEmbedHtml, 'src="https://www.youtube.com/embed/video123"', "shared notion content module should normalize common watch URLs into iframe-friendly embed URLs");
expectNotIncludes(renderedEmbedHtml, 'class="post-resource post-resource-embed"', "shared notion content module should not wrap embeds in the generic resource card shell");
const unsupportedEmbedHtml = normalizeHtml(notionContentHelpers.renderBlocks([{
  type: "resource",
  resourceType: "embed",
  url: "https://example.com/embed",
  caption: "",
  captionHtml: "",
  name: "",
}], {
  baseOrigin: FIXTURE_BASE_ORIGIN,
}));
expectIncludes(unsupportedEmbedHtml, 'class="post-embed post-embed-link-only"', "shared notion content module should degrade unsupported embed URLs to a lightweight link block");
expectNotIncludes(unsupportedEmbedHtml, 'class="post-embed-frame"', "shared notion content module should avoid rendering blank iframes for unsupported embed providers");
const missingEmbedHtml = normalizeHtml(notionContentHelpers.renderBlocks([{
  type: "resource",
  resourceType: "embed",
  url: "",
  caption: "",
  captionHtml: "",
  name: "",
}], {
  baseOrigin: FIXTURE_BASE_ORIGIN,
}));
assert.ok(
  !missingEmbedHtml.includes('class="post-resource post-resource-embed"'),
  "shared notion content module should drop embed cards entirely when no usable embed URL is available",
);
assert.ok(
  !missingEmbedHtml.includes('class="post-resource post-resource-resource"'),
  "shared notion content module should not fall back to the generic resource card for empty embed blocks",
);
const ephemeralCoverImage = "https://assets.example.com/image.png?X-Amz-Algorithm=test&X-Amz-Signature=signature";
let bookmarkStorageHandler = null;
const bookmarkUpdatedEvents = [];
class BookmarkCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}
const bookmarkManagerHarness = loadBrowserScript("js/bookmark.js", {
  window: {
    CSS: {
      escape: (value) => String(value),
    },
    CustomEvent: BookmarkCustomEvent,
    addEventListener(type, handler) {
      if (type === "storage") {
        bookmarkStorageHandler = handler;
      }
    },
    dispatchEvent(event) {
      bookmarkUpdatedEvents.push(event);
      return true;
    },
    SiteUtils: {
      resolveDisplayImageUrl: (value) => (typeof value === "string" && value.startsWith("https://") ? value : null),
      sanitizeImageUrl: () => null,
      sanitizeCoverBackground: (value) => value,
    },
  },
});
assert.equal(
  bookmarkManagerHarness.window.BookmarkManager.toggle({
    id: "bookmark-1",
    title: "Ephemeral cover",
    coverImage: ephemeralCoverImage,
    coverEmoji: "📘",
    coverGradient: "linear-gradient(135deg, #111111, #222222)",
    tags: [],
  }),
  true,
  "bookmark manager should add a new bookmark entry",
);
assert.equal(
  bookmarkManagerHarness.window.BookmarkManager.getAll()[0]?.coverImage,
  ephemeralCoverImage,
  "bookmark manager should preserve displayable cover URLs even when they are expiring remote assets",
);
assert.equal(
  bookmarkManagerHarness.window.BookmarkManager.getAll()[0]?.metadataVersion,
  4,
  "bookmark manager should persist the upgraded metadata version for new bookmarks",
);
assert.equal(
  bookmarkUpdatedEvents.length,
  1,
  "bookmark manager should broadcast after direct toggle changes",
);
assert.equal(
  bookmarkUpdatedEvents[0]?.detail?.bookmarks?.[0]?.id,
  "bookmark-1",
  "direct bookmark toggle events should include the latest bookmark snapshot",
);
assert.equal(
  bookmarkManagerHarness.window.BookmarkManager.toggleById("bookmark-1"),
  false,
  "bookmark manager should remove an existing bookmark by id",
);
assert.equal(
  bookmarkUpdatedEvents.length,
  2,
  "bookmark manager should broadcast after toggleById changes",
);
assert.equal(
  bookmarkUpdatedEvents.at(-1)?.detail?.bookmarks?.length,
  0,
  "toggleById bookmark events should include the post-removal snapshot",
);
bookmarkStorageHandler?.({
  key: "bookmarked_posts",
  newValue: JSON.stringify([{
    id: "storage-bookmark-old",
    title: "Old storage bookmark",
    tags: ["Cross tab"],
  }]),
});
bookmarkStorageHandler?.({
  key: "bookmarked_posts",
  newValue: JSON.stringify([{
    id: "storage-bookmark",
    title: "Storage bookmark",
    tags: ["Cross tab"],
  }]),
});
assert.equal(
  bookmarkUpdatedEvents.length,
  2,
  "bookmark manager should debounce rapid cross-tab storage events before broadcasting",
);
await new Promise((resolve) => setTimeout(resolve, 130));
assert.equal(
  bookmarkUpdatedEvents.length,
  3,
  "bookmark manager should coalesce rapid cross-tab storage events into one broadcast",
);
assert.equal(
  bookmarkUpdatedEvents.at(-1)?.type,
  "bookmarks:updated",
  "bookmark manager should broadcast a local event after cross-tab storage updates",
);
assert.equal(
  bookmarkUpdatedEvents.at(-1)?.detail?.bookmarks?.[0]?.id,
  "storage-bookmark",
  "bookmark manager update events should include the normalized bookmark snapshot",
);
assert.equal(
  bookmarkManagerHarness.window.BookmarkManager.isBookmarked("storage-bookmark"),
  true,
  "bookmark manager should refresh its cache before broadcasting cross-tab bookmark updates",
);
const renamedSchema = notionContentHelpers.resolveNotionContentSchema({
  properties: {
    Title: { id: "title", name: "Title", type: "title" },
    Summary: { id: "excerpt", name: "Summary", type: "rich_text" },
    "Read Time": { id: "readTime", name: "Read Time", type: "rich_text" },
    Tags: { id: "tags", name: "Tags", type: "multi_select" },
    Category: { id: "category", name: "Category", type: "select" },
    "Published At": { id: "date", name: "Published At", type: "date" },
  },
});
assert.equal(renamedSchema.title?.name, "Title", "schema resolution should find renamed title properties");
assert.equal(
  notionContentHelpers.buildPostSearchText({
    title: "  Shared Search  ",
    excerpt: "Helper Text",
    tags: ["TypeScript", "  Testing "],
  }),
  "shared search helper text typescript testing",
  "shared notion content helpers should normalize reusable post search text consistently",
);
assert.equal(
  notionContentHelpers.richTextToHtml([{
    plain_text: "Internal link",
    href: "/posts/post-1",
    annotations: {},
  }], {
    baseOrigin: FIXTURE_BASE_ORIGIN,
  }),
  '<a href="https://example.com/posts/post-1">Internal link</a>',
  "shared notion content helpers should keep same-origin rich-text links in the current tab",
);
assert.equal(
  notionContentHelpers.richTextToHtml([{
    plain_text: "External link",
    href: "https://external.example/post",
    annotations: {},
  }], {
    baseOrigin: FIXTURE_BASE_ORIGIN,
  }),
  '<a href="https://external.example/post" target="_blank" rel="noopener">External link</a>',
  "shared notion content helpers should keep external rich-text links isolated in a new tab",
);
assert.equal(
  notionContentHelpers.mapNotionPage({
    id: "post-1",
    icon: { emoji: "📘" },
    properties: {
      Title: { id: "title", name: "Title", type: "title", title: [{ plain_text: "Schema-aware title" }] },
      Summary: { id: "excerpt", name: "Summary", type: "rich_text", rich_text: [{ plain_text: "Schema-aware excerpt" }] },
      "Read Time": { id: "readTime", name: "Read Time", type: "rich_text", rich_text: [{ plain_text: "5 min" }] },
      Tags: { id: "tags", name: "Tags", type: "multi_select", multi_select: [{ name: "TypeScript" }] },
      Category: { id: "category", name: "Category", type: "select", select: { name: "Tech" } },
      "Published At": { id: "date", name: "Published At", type: "date", date: { start: "2026-04-08" } },
    },
  }, {
    schema: renamedSchema,
  }).title,
  "Schema-aware title",
  "page mapping should honor the resolved schema when Notion properties are renamed",
);
const mappedPageWithSearchText = notionContentHelpers.mapNotionPage({
  id: "post-search",
  properties: {
    Title: { id: "title", name: "Title", type: "title", title: [{ plain_text: "Searchable title" }] },
    Summary: { id: "excerpt", name: "Summary", type: "rich_text", rich_text: [{ plain_text: "Searchable excerpt" }] },
    Tags: { id: "tags", name: "Tags", type: "multi_select", multi_select: [{ name: "Searchable tag" }] },
  },
}, {
  includeSearchText: true,
});
assert.ok(
  mappedPageWithSearchText._searchText.includes("searchable title"),
  "page mapping should still precompute derived search text for server filtering",
);
assert.ok(
  !Object.prototype.propertyIsEnumerable.call(mappedPageWithSearchText, "_searchText"),
  "page mapping should keep derived search text out of public JSON payloads",
);
assert.ok(
  !JSON.stringify(mappedPageWithSearchText).includes("_searchText"),
  "page mapping should not serialize derived search text in public responses",
);
const sharedArticleStructuredData = notionContentHelpers.buildArticleStructuredData({
  id: "post-1",
  title: "Structured article",
  excerpt: "Structured excerpt",
  category: "Tech",
  date: "2026-04-17",
  coverImage: "https://example.com/cover.png",
  tags: ["Alpha", "Beta"],
}, {
  canonicalUrl: "https://example.com/posts/post-1",
  defaultShareImageUrl: "https://example.com/og-image.jpg?v=4",
  baseOrigin: "https://example.com",
});
assert.equal(
  sharedArticleStructuredData.mainEntityOfPage,
  "https://example.com/posts/post-1",
  "shared notion content helpers should build canonical article structured data",
);
assert.equal(
  sharedArticleStructuredData.image[0],
  "https://example.com/cover.png",
  "shared notion content helpers should preserve stable article images in structured data",
);
const serverArticleStructuredData = serverNotionHelpers.buildArticleStructuredData({
  id: "post-1",
  title: "Structured article",
  excerpt: "Structured excerpt",
  category: "Tech",
  date: "2026-04-17",
  coverImage: "https://example.com/cover.png",
  tags: ["Alpha", "Beta"],
});
assert.equal(
  serverArticleStructuredData.headline,
  "Structured article",
  "server notion structured data should preserve the article headline",
);
assert.equal(
  serverArticleStructuredData.keywords,
  "Alpha, Beta",
  "server notion structured data should preserve normalized article keywords",
);
assert.ok(
  serverArticleStructuredData.mainEntityOfPage.endsWith("/posts/post-1"),
  "server notion structured data should point at the canonical post route",
);
assert.equal(
  serverArticleStructuredData.image[0],
  "https://example.com/cover.png",
  "server notion structured data should preserve stable article images",
);
function buildBookmarkListingUrlMock({ search = "", page = 1, pathname = "/blog.html" } = {}) {
  const params = new URLSearchParams();
  const normalizedSearch = typeof search === "string" ? search.trim() : "";
  const normalizedPage = Math.max(1, Number.parseInt(String(page ?? ""), 10) || 1);
  if (normalizedSearch) params.set("search", normalizedSearch);
  if (normalizedPage > 1) params.set("page", String(normalizedPage));
  const query = params.toString();
  return `${pathname}#bookmarks${query ? `?${query}` : ""}`;
}

function parseBookmarkListingHashMock(hash = "") {
  const rawHash = typeof hash === "string" ? hash.trim() : "";
  if (!rawHash.startsWith("#bookmarks")) {
    return { active: false, search: "", page: 1, normalizedHash: "" };
  }
  const params = new URLSearchParams(rawHash.slice("#bookmarks".length).replace(/^\?/, ""));
  const search = (params.get("search") || "").trim();
  const page = Math.max(1, Number.parseInt(String(params.get("page") || ""), 10) || 1);
  const normalizedHash = `#bookmarks${params.toString() ? `?${params.toString()}` : ""}`;
  return { active: true, search, page, normalizedHash };

}
const registeredPages = new Map();
await runBlogPageChecks({
  assert,
  FakeElement,
  buildBookmarkListingUrlMock,
  createClassList,
  createJsonResponse,
  loadBrowserScript,
  notionContentHelpers,
  parseBookmarkListingHashMock,
  registeredPages,
  siteUtilsHarness,
});
await runNotionApiClientChecks({
  assert,
  createJsonResponse,
  createQuotaLimitedStorageMock,
  createStorageMock,
  ephemeralCoverImage,
  loadBrowserScript,
  notionContentHelpers,
});
expectIncludes(notionApiJs, "createRequestError", "notion client should preserve HTTP status metadata on failures");
expectIncludes(notionApiJs, "error.status = Number(status);", "notion client should attach status codes to request errors");
expectIncludes(notionApiJs, 'postsEndpoint: "/api/posts-data"', "notion client should load post listings from the semantic endpoint");
expectIncludes(notionApiJs, 'postEndpoint: "/api/post-data"', "notion client should load post details from the restricted endpoint");
expectIncludes(notionApiJs, "sharedContent.renderPostArticle", "notion client should reuse the shared article renderer instead of duplicating article markup");
expectIncludes(notionApiJs, "POST_SUMMARY_CACHE_TTL", "notion client should keep a separate summary cache for bookmarks");
expectIncludes(notionApiJs, "window.NotionContent", "notion client should reuse shared notion content helpers");
expectIncludes(notionApiJs, "const sharedContent = window.NotionContent;", "notion client should require the shared content module loaded by app.js");
expectIncludes(notionApiJs, "const escapeHtml = sharedContent.escapeHtml;", "notion client should use the shared HTML escaper directly");
expectIncludes(notionApiJs, "return sharedContent.normalizeSearchText(value);", "notion client should use the shared search normalizer directly");
expectNotIncludes(notionApiJs, "@canonical-source", "notion client should not keep dead local copies of shared helper fallbacks");
expectNotIncludes(notionApiJs, "FALLBACK_REMOTE_BLOG_CATEGORIES", "notion client should not keep duplicated category fallbacks");
expectIncludes(notionApiJs, 'console.debug("Failed to persist Notion session cache:", error);', "notion client should surface session cache persistence failures for debugging");
assert.ok(
  !notionApiJs.includes("const RESPONSE_CACHE_TTL"),
  "notion client should remove zero-effect response cache branches instead of carrying disabled cache code",
);
assert.ok(
  !notionApiJs.includes("const RESPONSE_STALE_TTL"),
  "notion client should remove stale-response cache branches when public content must stay live",
);
assert.ok(
  !notionApiJs.includes("浠ヤ笅閫昏緫涓庢湇鍔＄"),
  "notion client should not ask maintainers to keep a duplicated server copy in sync",
);
assert.ok(
  !notionApiJs.includes("function mapNotionPage("),
  "notion client should not duplicate raw notion page mapping helpers locally",
);
assert.ok(
  !notionApiJs.includes("function mapNotionBlock("),
  "notion client should not duplicate raw notion block mapping helpers locally",
);
assert.ok(
  !notionApiJs.includes("function fetchPostSummaries("),
  "notion client should not keep the unused full-summary prefetch path",
);
assert.ok(
  !notionApiJs.includes('workerUrl: "/api"'),
  "notion client should not depend on the generic Notion proxy for post listings",
);
assert.ok(
  !notionApiJs.includes('databaseId: "32485b780a2580eaa67ecf051676d693"'),
  "notion client should not embed the Notion database id anymore",
);
expectIncludes(indexPageJs, "function navigateTo(url)", "index page should provide a navigation fallback helper");
expectIncludes(indexPageJs, "window.location.href = url", "index page should fall back to full navigation");
expectIncludes(indexPageJs, 'searchForm.addEventListener("submit", handleSearchSubmit);', "index page should intercept the real search form for SPA navigation");
expectIncludes(indexPageJs, 'ctaHome.href = "/blog.html";', "index page should preserve a native home/blog link fallback");
expectIncludes(indexPageJs, "siteUtils.buildBookmarkListingUrl", "index page should reuse the shared bookmark-listing URL helper");
expectNotIncludes(indexPageJs, "ctaHome.addEventListener", "index page should leave CTA link navigation to the shared SPA router");
expectNotIncludes(indexPageJs, "ctaStart.addEventListener", "index page should leave featured CTA navigation to the shared SPA router");
expectNotIncludes(indexPageJs, "ctaWiki.addEventListener", "index page should leave bookmark CTA navigation to the shared SPA router");
expectIncludes(indexPageJs, 'navigateTo(`/blog.html?search=${encodeURIComponent(query)}`);', "index page search navigation should use root-relative paths");
expectIncludes(postPageJs, 'window.StructuredData?.set?.("post-article"', "post page should publish article structured data");
expectIncludes(postPageJs, "sharedContent.buildArticleStructuredData", "post page should reuse the shared article structured-data helper");
expectIncludes(postPageJs, "initialPostData", "post page should reuse server-rendered post payloads");
expectIncludes(postPageJs, "notionApi.renderPostArticle(post)", "post page should reuse the shared article-shell renderer for client-side redraws");
expectIncludes(postPageJs, "siteUtils.getPreferredBlogReturnUrl", "post page back navigation should restore the preferred blog listing route");
expectIncludes(postPageJs, "nowBookmarked === null", "post page should leave bookmark UI unchanged when persistence fails");
expectIncludes(postPageJs, "isMissingPostError", "post page should distinguish not-found posts from temporary failures");
expectIncludes(postPageJs, "return Number(error?.status) === 404;", "post page should trust the server's HTTP status for missing-post classification");
expectNotIncludes(postPageJs, 'error?.notionCode === "validation_error"', "post page should leave Notion-specific missing-post classification to the server");
expectIncludes(postPageJs, "showEmpty(isMissingPostError(error) ? \"not-found\" : \"unavailable\")", "post page should map 404-like errors to the not-found empty state");
expectIncludes(postPageJs, "收藏失败，请稍后重试", "post page should announce bookmark persistence failures");
expectIncludes(postPageJs, "hasServerRenderedContent", "post page should detect pre-rendered article content");
expectIncludes(postPageJs, "showServerRenderedFallback", "post page should preserve server-rendered content when NotionAPI is unavailable");
expectIncludes(postPageJs, 'console.warn("NotionAPI is unavailable on post page.")', "post page should report SSR fallback as a warning instead of an error");
expectNotIncludes(postPageJs, 'console.error("NotionAPI is unavailable on post page.")', "post page should not write expected SSR fallback to stderr as an error");
expectIncludes(postPageJs, "canBookmarkFromInitialData", "post page should recover bookmark controls from SSR initial data when the client API is unavailable");
expectIncludes(postPageJs, "initBookmark(initialPostData);", "post page should still wire bookmark controls from SSR summary data in fallback mode");
expectIncludes(postPageJs, "isMobileViewport || element === navBookmark", "post page should hide article bookmark controls on mobile through JavaScript state");
expectIncludes(postPageJs, "createMobileDeviceQueryList", "post page should use the shared real-mobile query for bookmark control placement");
expectIncludes(postPageJs, 'window.addEventListener?.("bookmarks:updated", bookmarksUpdatedHandler)', "post page should listen for cross-tab bookmark updates");
assert.ok(
  postPageJs.indexOf("const postId = getCurrentPostId();") < postPageJs.indexOf('if (!notionApi)'),
  "post page should initialize route state before the NotionAPI fallback branch runs",
);
expectNotIncludes(postPageJs, "?{", "post page should not contain corrupted template interpolations");
expectIncludes(postPageJs, 'robots: "index, follow"', "post page should restore article robots metadata after load");
assert.ok(
  !postPageJs.includes("reading_history"),
  "post page should not keep unused reading_history persistence code",
);
const registeredPostPages = new Map();
let fallbackBookmarkToggleCount = 0;
let fallbackBookmarkState = false;
const postBookmarkUpdateHandlers = new Set();
class FakeScriptElement extends FakeElement {}
const postSkeletonEl = new FakeElement();
const postContentEl = new FakeElement();
postContentEl.innerHTML = "<div>SSR article body</div>";
const postEmptyEl = new FakeElement();
const postBackEl = new FakeElement();
postBackEl.style = {
  removeProperty() {},
  setProperty() {},
};
const postArticleEl = new FakeElement();
postArticleEl.querySelector = (selector) => (selector === ".post-back" ? postBackEl : null);
const fabBookmarkEl = new FakeElement();
const fabBookmarkLabelEl = new FakeElement();
fabBookmarkEl.querySelector = (selector) => (selector === ".fab-bookmark-label" ? fabBookmarkLabelEl : null);
const navBookmarkEl = new FakeElement();
navBookmarkEl.querySelector = () => null;
const postStatusEl = new FakeElement();
const initialPostDataScriptEl = new FakeScriptElement();
initialPostDataScriptEl.textContent = JSON.stringify({
  id: "post-1",
  title: "SSR fallback title",
  excerpt: "SSR fallback excerpt",
  category: "Tech",
  date: "2026-04-17",
  readTime: "5 min",
  coverImage: null,
  coverEmoji: "馃摑",
  coverGradient: "linear-gradient(135deg, #111111, #222222)",
  tags: ["TypeScript"],
});
const fallbackWarnings = [];
loadBrowserScript("js/post-page.js", {
  window: {
    location: new URL("https://example.com/posts/post-1"),
    addEventListener(type, handler) {
      if (type === "bookmarks:updated") {
        postBookmarkUpdateHandlers.add(handler);
      }
    },
    removeEventListener(type, handler) {
      if (type === "bookmarks:updated") {
        postBookmarkUpdateHandlers.delete(handler);
      }
    },
    BookmarkManager: {
      isBookmarked: () => fallbackBookmarkState,
      toggle(post) {
        fallbackBookmarkToggleCount += 1;
        if (post?.id !== "post-1") return null;
        fallbackBookmarkState = !fallbackBookmarkState;
        return fallbackBookmarkState;
      },
    },
    PageRuntime: {
      register(pageId, pageModule) {
        registeredPostPages.set(pageId, pageModule);
      },
    },
    SiteUtils: {
      getPostIdFromUrl: () => "post-1",
      normalizePostId: (value) => String(value || "").trim() || null,
      createMediaQueryList: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
      getPreferredBlogReturnUrl: () => "https://example.com/blog.html",
    },
  },
  document: {
    getElementById(id) {
      return {
        postSkeleton: postSkeletonEl,
        postContent: postContentEl,
        postEmpty: postEmptyEl,
        postArticle: postArticleEl,
        fabBookmark: fabBookmarkEl,
        navBookmark: navBookmarkEl,
        postBack: postBackEl,
        postStatus: postStatusEl,
        initialPostData: initialPostDataScriptEl,
      }[id] || null;
    },
  },
  globals: {
    console: {
      ...console,
      warn(message, ...args) {
        fallbackWarnings.push([message, ...args]);
      },
    },
    HTMLScriptElement: FakeScriptElement,
  },
});
const postPageCleanup = registeredPostPages.get("post")?.init?.();
await Promise.resolve();
assert.deepEqual(
  fallbackWarnings,
  [["NotionAPI is unavailable on post page."]],
  "post page should report the expected SSR fallback warning without writing to stderr during smoke checks",
);
assert.equal(
  fabBookmarkEl.style.display,
  "flex",
  "post page should keep the floating bookmark control available when only the SSR fallback payload is available",
);
assert.equal(
  fabBookmarkEl.getAttribute("aria-pressed"),
  "false",
  "post page should initialize fallback bookmark controls from the current bookmark cache",
);
fallbackBookmarkState = true;
postBookmarkUpdateHandlers.forEach((handler) => handler());
assert.equal(
  fabBookmarkEl.getAttribute("aria-pressed"),
  "true",
  "post page should refresh fallback bookmark controls after cross-tab bookmark updates",
);
fallbackBookmarkState = false;
postBookmarkUpdateHandlers.forEach((handler) => handler());
fabBookmarkEl.dispatch("click");
assert.equal(
  fallbackBookmarkToggleCount,
  1,
  "post page should still wire bookmark interactions from SSR initial data when the client API is unavailable",
);
postPageCleanup?.();
assert.equal(
  postBookmarkUpdateHandlers.size,
  0,
  "post page should remove cross-tab bookmark listeners during cleanup",
);
expectIncludes(apiPostJs, 'upsertStructuredDataScript(html, "post-article"', "article HTML route should emit structured data");
expectIncludes(apiPostJs, 'id="initialPostData"', "article HTML route should emit initial post data");
expectIncludes(apiPostJs, "buildUnavailableContent", "article HTML route should distinguish upstream failures from not-found routes");
expectIncludes(apiPostJs, "rejectUnsupportedReadMethod", "article HTML route should reuse the shared read-method guard");
expectIncludes(apiPostJs, "getPublicPostErrorStatus", "article HTML route should reuse shared public-post error mapping");
expectIncludes(apiPostJs, "fetchPublicPost", "article HTML route should only render posts from the public blog set");
expectIncludes(apiPostJs, "renderPostArticle(post, { renderedContent, baseOrigin })", "article HTML route should reuse the shared article-shell renderer for SSR");
expectIncludes(apiPostJs, "POST_CONTENT_PATTERN", "article HTML route should tolerate harmless postContent template attribute changes");
expectIncludes(apiPostJs, "postContent:fallback", "article HTML route should fall back to article insertion when the postContent anchor changes");
expectIncludes(apiPostJs, '"Cache-Control", "no-store"', "article HTML route should not cache public post responses");
expectIncludes(apiPostJs, "templatePromise = null;", "article HTML route should clear a failed production template read before retrying");
expectIncludes(apiPostJs, "HEAD_META_BLOCK_START", "article HTML route should replace head metadata through explicit template anchors");
expectIncludes(apiPostJs, "replaceMarkup(", "article HTML route should use literal-safe SSR replacements for dynamic content");
expectIncludes(apiPostJs, "upsertHeadMarkup", "article HTML route should centralize head-tag insertion and replacement");
expectNotIncludes(apiPostJs, "result !== html", "article HTML route should track replacement matches explicitly instead of comparing final strings");
expectIncludes(apiPostJs, "resolveShareImageUrl(post.coverImage, defaultShareImageUrl, siteOrigin)", "article HTML route should resolve og:image against the site origin consistently");
expectIncludes(apiPostJs, "../server/security-policy", "article HTML route should reuse the shared security policy builder");
expectIncludes(apiPostJs, "createCspNonce", "article HTML route should use per-request nonces for inline JSON data");
expectIncludes(apiPostJs, "applyHtmlSecurityHeaders", "article HTML route should emit nonce-aware CSP headers from the SSR function");
expectIncludes(apiPostJs, "replaceContentSecurityPolicyMeta", "article HTML route should keep template CSP meta in sync with the response nonce");
expectIncludes(postHtml, "<!--SSR_HEAD_META_START-->", "post template should mark the SSR-owned head metadata block explicitly");
expectIncludes(postHtml, "<!--SSR_HEAD_META_END-->", "post template should keep a closing marker for the SSR-owned head metadata block");
expectNotIncludes(apiPostJs, "script-src-elem 'self' 'unsafe-inline'", "article HTML route should not allow arbitrary inline script elements");
expectNotIncludes(spaRouterJs, "rememberPageHtml(cacheKey, entry.html)", "SPA route cache reads should not refresh cachedAt into a sliding TTL");
expectIncludes(spaRouterJs, "pageCache.set(cacheKey, entry)", "SPA route cache reads should only refresh LRU order while preserving cachedAt");
expectIncludes(serverPostServiceJs, "const postSearchTextCache = new WeakMap()", "server search filtering should cache derived search text without mutating post objects");
expectNotIncludes(serverPostServiceJs, "Object.defineProperty(post, POST_SEARCH_TEXT_SYMBOL", "server search filtering should not attach derived search text to post inputs");

const replacementSentinel = "$& :: $` :: $'";
const escapedReplacementSentinel = "$&amp; :: $` :: $&#39;";
const nonceSentinel = "nonce-test-123";
const replacedPostContent = apiPostHelpers.replacePostContent(
  '<article><div class="placeholder" id="postContent" data-template="changed"></div></article>',
  {
    id: "post-1",
    title: "Rendered title",
    tags: [],
  },
  {
    renderedContent: "<p>Rendered body</p>",
    baseOrigin: "https://example.com",
  },
);
expectIncludes(replacedPostContent, 'id="postContent" style="display: block;"', "post content replacement should not depend on the original style attribute");
expectIncludes(replacedPostContent, "Rendered body", "post content replacement should preserve SSR article body markup");
const injectedInitialPostData = apiPostHelpers.injectInitialPostData("<main></main>", {
  title: replacementSentinel,
}, {
  scriptNonce: nonceSentinel,
});
expectIncludes(injectedInitialPostData, replacementSentinel, "initial post data injection should preserve replacement tokens literally");
expectIncludes(injectedInitialPostData, `nonce="${nonceSentinel}"`, "initial post data injection should carry the request CSP nonce");
const initialPostPayload = apiPostHelpers.buildInitialPostPayload({
  id: "post-1",
  title: "Payload title",
  excerpt: "Payload excerpt",
  category: "Tech",
  date: "2026-04-11",
  readTime: "5 min",
  coverImage: "https://example.com/cover.png",
  coverEmoji: "棣冩憫",
  coverGradient: "linear-gradient(135deg, #111111, #222222)",
  tags: ["TypeScript"],
  content: [{ type: "paragraph", text: "Hello" }],
  renderedContent: "<p>Hello</p>",
});
assert.ok(
  !("content" in initialPostPayload) && !("renderedContent" in initialPostPayload),
  "article HTML route should keep the inline initial payload summary-only when SSR markup is already present",
);

const structuredDataHtml = apiPostHelpers.upsertStructuredDataScript("<head></head>", "post-article", {
  headline: replacementSentinel,
}, {
  scriptNonce: nonceSentinel,
});
expectIncludes(structuredDataHtml, replacementSentinel, "structured data injection should preserve replacement tokens literally");
expectIncludes(structuredDataHtml, `nonce="${nonceSentinel}"`, "structured data injection should carry the request CSP nonce");
const nonceContentSecurityPolicy = securityPolicyHelpers.buildContentSecurityPolicy({
  scriptNonce: nonceSentinel,
});
expectIncludes(
  nonceContentSecurityPolicy,
  `script-src 'self' 'nonce-${nonceSentinel}'`,
  "article HTML route should allow inline JSON scripts only through the request nonce",
);
expectIncludes(
  nonceContentSecurityPolicy,
  "frame-ancestors 'none'",
  "article HTML route CSP should preserve clickjacking protection when emitted as a header",
);
expectNotIncludes(
  nonceContentSecurityPolicy,
  "script-src 'self' 'unsafe-inline'",
  "article HTML route nonce CSP should not fall back to unsafe inline scripts",
);
expectNotIncludes(
  nonceContentSecurityPolicy,
  "script-src-elem 'self' 'unsafe-inline'",
  "article HTML route nonce CSP should not allow arbitrary inline script elements",
);
const replacedCspMeta = apiPostHelpers.replaceContentSecurityPolicyMeta(
  '<head><meta http-equiv="Content-Security-Policy" content="old" /></head>',
  { scriptNonce: nonceSentinel },
);
expectIncludes(replacedCspMeta, `nonce-${nonceSentinel}`, "article HTML route should mirror the request nonce into the CSP meta tag");
expectNotIncludes(replacedCspMeta, "frame-ancestors", "article HTML route should avoid frame-ancestors in meta CSP where browsers ignore it");
const reorderedCspMeta = apiPostHelpers.replaceContentSecurityPolicyMeta(
  "<head><meta content='old' data-test='1' http-equiv='content-security-policy'></head>",
  { scriptNonce: nonceSentinel },
);
expectIncludes(reorderedCspMeta, `nonce-${nonceSentinel}`, "article HTML route should replace CSP meta tags regardless of attribute order or quote style");
expectNotIncludes(reorderedCspMeta, "content='old'", "article HTML route should not leave an old CSP meta policy behind when attributes are reordered");
assert.equal(
  (reorderedCspMeta.match(/http-equiv="Content-Security-Policy"/g) || []).length,
  1,
  "article HTML route should emit one canonical CSP meta tag after replacing a reordered template tag",
);
const duplicateCspWarnings = [];
const originalDuplicateCspConsoleWarn = console.warn;
console.warn = (...args) => {
  duplicateCspWarnings.push(args.join(" "));
};
let dedupedCspMeta = "";
try {
  dedupedCspMeta = apiPostHelpers.replaceContentSecurityPolicyMeta(
    "<head><meta http-equiv=Content-Security-Policy content=old><meta content=\"legacy\" http-equiv=\"Content-Security-Policy\"></head>",
    { scriptNonce: nonceSentinel },
  );
} finally {
  console.warn = originalDuplicateCspConsoleWarn;
}
assert.equal(
  (dedupedCspMeta.match(/http-equiv="Content-Security-Policy"/g) || []).length,
  1,
  "article HTML route should collapse duplicate CSP meta tags to avoid intersecting policies",
);
assert.ok(
  duplicateCspWarnings.some((message) => message.includes("Found 2 CSP meta tags")),
  "article HTML route should warn when duplicate CSP meta tags are removed",
);
expectNotIncludes(dedupedCspMeta, "content=old", "article HTML route should remove duplicate unquoted CSP meta policies");
expectNotIncludes(dedupedCspMeta, 'content="legacy"', "article HTML route should remove duplicate quoted CSP meta policies");

const replacedHeadMeta = apiPostHelpers.replaceHeadMeta(`<!doctype html><html><head>
<!--SSR_HEAD_META_START-->
<title>Old</title>
<meta name="description" content="old" />
<meta property="og:title" content="old" />
<meta property="og:description" content="old" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://example.com/old" />
<meta property="og:image" content="https://example.com/old.png" />
<meta property="og:image:alt" content="old" />
<link rel="canonical" href="https://example.com/old" />
<!--SSR_HEAD_META_END-->
</head></html>`, {
  title: replacementSentinel,
  description: replacementSentinel,
  url: "https://example.com/posts/sentinel",
  image: "https://example.com/sentinel.png",
  imageAlt: replacementSentinel,
  canonicalUrl: "https://example.com/posts/sentinel",
  robots: "index, follow",
  ogType: "article",
});
expectIncludes(replacedHeadMeta, `<title>${escapedReplacementSentinel}</title>`, "head metadata replacement should preserve replacement tokens in the page title");
expectIncludes(replacedHeadMeta, "<!--SSR_HEAD_META_START-->", "head metadata replacement should preserve the start template anchor");
expectIncludes(replacedHeadMeta, "<!--SSR_HEAD_META_END-->", "head metadata replacement should preserve the end template anchor");
assert.ok(
  !replacedHeadMeta.includes("<title><title>Old</title></title>"),
  "head metadata replacement should not reinsert the original title through replacement tokens",
);
const originalConsoleWarn = console.warn;
const sameValueReplacementWarnings = [];
console.warn = (...args) => {
  sameValueReplacementWarnings.push(args.join(" "));
};
try {
  apiPostHelpers.replaceHeadMeta(`<!doctype html><html><head>
<title>Same title</title>
<meta name="description" content="Same description" />
<meta property="og:title" content="Same title" />
<meta property="og:description" content="Same description" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://example.com/post.html" />
<meta property="og:image" content="https://example.com/og-image.jpg?v=4" />
<meta property="og:image:alt" content="Share Everything" />
<link rel="canonical" href="https://example.com/post.html" />
</head></html>`, {
    title: "Same title",
    description: "Same description",
    url: "https://example.com/post.html",
    image: "https://example.com/og-image.jpg?v=4",
    imageAlt: "Share Everything",
    canonicalUrl: "https://example.com/post.html",
    robots: "",
    ogType: "website",
  });
} finally {
  console.warn = originalConsoleWarn;
}
assert.equal(
  sameValueReplacementWarnings.length,
  0,
  "head metadata replacement should not warn when a template pattern matched but the replacement value is unchanged",
);

const replacedEmptyState = apiPostHelpers.replaceEmptyStateContent(
  '<div class="empty-state" id="postEmpty"><svg></svg><p>old</p><p class="empty-state-helper"><a class="empty-state-link" href="/old">old</a></p></div>',
  {
    message: replacementSentinel,
    linkText: replacementSentinel,
  },
);
assert.equal(
  replacedEmptyState.match(new RegExp(escapeRegex(escapedReplacementSentinel), "g"))?.length,
  2,
  "empty-state replacement should preserve replacement tokens in both the message and link text",
);
const postRouteMethodNotAllowedRes = createApiResponseRecorder();
await apiPostHandler({ method: "POST", query: {} }, postRouteMethodNotAllowedRes);
assert.equal(postRouteMethodNotAllowedRes.statusCode, 405, "article HTML route should reject unsupported methods with HTTP 405");
assert.equal(postRouteMethodNotAllowedRes.getHeader("allow"), "GET, HEAD", "article HTML route should advertise the supported read methods on 405 responses");
assert.equal(postRouteMethodNotAllowedRes.getHeader("cache-control"), "no-store", "article HTML route should mark 405 responses as non-cacheable");
const headReadGuardRes = createApiResponseRecorder();
assert.equal(
  publicContentHelpers.rejectUnsupportedReadMethod({ method: "HEAD" }, headReadGuardRes),
  false,
  "shared public read guard should accept HEAD alongside GET",
);
assert.equal(headReadGuardRes.ended, false, "shared public read guard should not end accepted HEAD requests");
expectIncludes(apiPostsDataJs, "queryPublicPosts", "post list endpoint should serve the public blog set through a semantic API");
expectIncludes(apiPostsDataJs, "s-maxage=60", "post list endpoint should allow short-lived CDN caching");
expectIncludes(apiPostDataJs, "fetchPublicPost", "post data endpoint should only serve posts from the public blog set");
expectIncludes(apiPostDataJs, "getPublicPostErrorStatus", "post data endpoint should reuse shared public-post error mapping");
expectIncludes(apiPostDataJs, '"Cache-Control", "no-store"', "post data endpoint should not cache public responses");
expectIncludes(publicContentJs, "rejectUnsupportedReadMethod", "public content helper should centralize read-only method guards");
expectIncludes(publicContentJs, "function logServerError", "public content helper should centralize sanitized server error logging");
expectIncludes(publicContentJs, 'payload.notionCode = error.notionCode;', "server error logging should preserve Notion error codes without logging full stacks");
expectIncludes(apiPostsDataJs, 'logServerError("Failed to load public post list", error)', "post list endpoint should log sanitized server errors");
expectIncludes(apiPostDataJs, 'logServerError("Failed to load post data", error)', "post data endpoint should log sanitized server errors");
expectIncludes(apiPostJs, 'logServerError("Failed to render post route", error)', "article HTML route should log sanitized server errors");
expectIncludes(apiSitemapJs, 'logServerError("Failed to generate sitemap", error)', "sitemap endpoint should log sanitized server errors");
expectNotIncludes(apiPostsDataJs, 'console.error("Failed to load public post list:", error)', "post list endpoint should not log full error objects");
expectNotIncludes(apiPostDataJs, 'console.error("Failed to load post data:", error)', "post data endpoint should not log full error objects");
expectNotIncludes(apiPostJs, 'console.error("Failed to render post route:", error)', "article HTML route should not log full error objects");
expectNotIncludes(apiSitemapJs, 'console.error("Failed to generate sitemap:", error)', "sitemap endpoint should not log full error objects");
const postsDataMethodNotAllowedRes = createApiResponseRecorder();
await apiPostsDataHandler({ method: "POST", query: {} }, postsDataMethodNotAllowedRes);
assert.equal(postsDataMethodNotAllowedRes.statusCode, 405, "post list endpoint should reject unsupported methods with HTTP 405");
assert.equal(postsDataMethodNotAllowedRes.getHeader("allow"), "GET, HEAD", "post list endpoint should advertise the supported read methods on 405 responses");
assert.equal(postsDataMethodNotAllowedRes.getHeader("cache-control"), "no-store", "post list endpoint should mark 405 responses as non-cacheable");
const postDataMethodNotAllowedRes = createApiResponseRecorder();
await apiPostDataHandler({ method: "POST", query: {} }, postDataMethodNotAllowedRes);
assert.equal(postDataMethodNotAllowedRes.statusCode, 405, "post data endpoint should reject unsupported methods with HTTP 405");
assert.equal(postDataMethodNotAllowedRes.getHeader("allow"), "GET, HEAD", "post data endpoint should advertise the supported read methods on 405 responses");
assert.equal(postDataMethodNotAllowedRes.getHeader("cache-control"), "no-store", "post data endpoint should mark 405 responses as non-cacheable");
await runApiContractChecks({
  assert,
  createApiResponseRecorder,
  expectIncludes,
  loadCommonJsModule,
});
await runImageProxyChecks({
  assert,
  Buffer,
  apiImageHandler,
  apiImageJs,
  createApiResponseRecorder,
  createImageRequestMock,
  expectIncludes,
  imageProxyDefaultConfig,
  loadCommonJsModule,
  publicImageDnsLookup,
  withEnvOverrides,
});
await runPublicContentAndNotionChecks({
  assert,
  blogPageJs,
  createJsonResponse,
  expectIncludes,
  expectNotIncludes,
  loadCommonJsModule,
  publicContentHelpers,
  publicContentJs,
  readmeMd,
  serverBlockServiceJs,
  serverCacheStoreJs,
  serverNotionClientJs,
  serverNotionHelpers,
  serverNotionJs,
  serverNotionSchemaJs,
  serverPostServiceJs,
  serverPublicPolicyJs,
  serverRenderServiceJs,
  withEnvOverrides,
});
await runRoutingAndVercelChecks({
  assert,
  apiNotionHandler,
  apiNotionJs,
  apiRobotsHandler,
  apiRobotsJs,
  apiSitemapJs,
  configuredSiteOrigin,
  createApiResponseRecorder,
  expectIncludes,
  expectNotIncludes,
  vercelJson,
});
console.log("Smoke check passed.");
