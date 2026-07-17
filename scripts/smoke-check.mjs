import { notionBlockFixtures } from "./fixtures/notion-block-fixtures.mjs";
import { runApiContractChecks } from "./smoke-check/api-contracts.mjs";
import { runBookmarkRotationChecks } from "./smoke-check/bookmark-rotation.mjs";
import { runBlogPageChecks } from "./smoke-check/blog-page.mjs";
import { runImageProxyChecks } from "./smoke-check/image-proxy.mjs";
import { runLocalServerIntegrationChecks } from "./smoke-check/local-server-integration.mjs";
import { runMobileLayoutChecks } from "./smoke-check/mobile-layout.mjs";
import { runContentModuleChecks } from "./smoke-check/content-modules.mjs";
import { runNotionApiClientChecks } from "./smoke-check/notion-api-client.mjs";
import { runPerformanceContractChecks } from "./smoke-check/performance-contract.mjs";
import { runParticleRuntimeChecks } from "./smoke-check/particle-runtime.mjs";
import { runPublicContentAndNotionChecks } from "./smoke-check/public-content-notion.mjs";
import { runRoutingAndVercelChecks } from "./smoke-check/routing-vercel.mjs";
import { runServerModuleChecks } from "./smoke-check/server-modules.mjs";
import { runSpaRouterChecks } from "./smoke-check/spa-router.mjs";
import { runToolingChecks } from "./smoke-check/tooling.mjs";
import * as parse5ForSmokeCheck from "parse5";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeExpectedAssetVersion } from "./lib/asset-fingerprint.mjs";
import { VISUAL_SCENARIO_NAMES } from "./lib/visual-scenarios.mjs";

const smokeRequire = createRequire(import.meta.url);
const { DEFAULT_SHARE_IMAGE_PATH: SHARED_DEFAULT_SHARE_IMAGE_PATH } =
  smokeRequire("../js/notion-content-shared.js");
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
  "js/blog-bootstrap.js",
  "js/bookmark.js",
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
  "scripts/build-mobile-fallbacks.mjs",
  "scripts/architecture-check.mjs",
  "scripts/inject-site-meta.mjs",
  "scripts/lib/asset-fingerprint.mjs",
  "scripts/lib/html-escape.mjs",
  "scripts/lib/html-rewriter.mjs",
  "scripts/lib/pixel-diff.mjs",
  "scripts/lib/visual-scenarios.mjs",
  "scripts/smoke-check/particle-runtime.mjs",
  "scripts/smoke-check/bookmark-rotation.mjs",
  "scripts/release-check.mjs",
  "scripts/stamp-asset-version.mjs",
  "scripts/visual-baselines/approve.mjs",
  "scripts/visual-baselines/generate.mjs",
  "scripts/fixtures/local-server-lifecycle-probe.cjs",
  "api/cover.js",
  "api/notion.js",
  "api/image.js",
  "api/posts-data.js",
  "api/post-data.js",
  "api/post.js",
  "api/robots.js",
  "api/sitemap.js",
  "server/public-content.js",
  "server/html-escape.js",
  "server/image-format.js",
  "server/image-proxy.js",
  "server/image-source-policy.js",
  "server/request-guard.js",
  "server/security-policy.js",
  "server/notion-config.js",
  "server/category-navigation.js",
  "server/cache-store.js",
  "server/canonical-query.js",
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
const configuredSiteName = typeof siteConfig.siteName === "string" ? siteConfig.siteName.trim() : "";
const packageMetadata = JSON.parse(packageJson);
const packageVersionMatch = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageMetadata.version || "");
assert.ok(packageVersionMatch, "package.json version should be a full semver version");
const [, releaseMajor, releaseMinor] = packageVersionMatch;
const releaseVersion = `v${releaseMajor}.${releaseMinor}`;
const assetReleaseSuffix = `v${releaseMajor}${releaseMinor}`;
const fixTodoVersionMatch = /更新时间：[\d-]+（(v\d+\.\d+)[^）]*）/.exec(read("FIX_TODO.md"));
assert.ok(fixTodoVersionMatch, "FIX_TODO.md 顶部必须包含“更新时间：YYYY-MM-DD（vX.Y...”格式");
assert.equal(
  fixTodoVersionMatch[1],
  releaseVersion,
  `FIX_TODO.md 顶部版本号 (${fixTodoVersionMatch[1]}) 与 package.json (${releaseVersion}) 不一致`,
);
const siteArchVersionMatch = /^> Version: (v\d+\.\d+)/m.exec(read("SITE_ARCHITECTURE.md"));
assert.ok(siteArchVersionMatch, "SITE_ARCHITECTURE.md 顶部必须含有“> Version: vX.Y”");
assert.equal(
  siteArchVersionMatch[1],
  releaseVersion,
  `SITE_ARCHITECTURE.md 顶部版本号 (${siteArchVersionMatch[1]}) 与 package.json (${releaseVersion}) 不一致`,
);
const configuredSiteOrigin = normalizeConfiguredSiteOrigin(siteConfig.siteUrl);
const featuredCategoryName = siteConfig.categoryNavigation.featured.name;
const featuredCategoryHref = `/blog.html?category=${encodeURIComponent(featuredCategoryName)}`;
const vercelJson = read("vercel.json");
const envExample = read(".env.example");
const webManifestJson = read("manifest.webmanifest");
const webManifest = JSON.parse(webManifestJson);
const faviconPng = readFileSync("favicon.png");
const ogImageJpg = readFileSync("og-image.jpg");
const mobileHomeStarryBgSvg = read("assets/mobile-home-starry-bg.svg");
const licenseText = read("LICENSE");
const localServerJs = read("scripts/local-server.mjs");
const releaseCheckJs = read("scripts/release-check.mjs");
const releaseCheckWorkflowYml = read(".github/workflows/release-check.yml");
const styleCss = read("css/style.css");
const blogPageCss = read("css/blog-page.css");
const postPageCss = read("css/post-page.css");
const commonJs = read("js/common.js");
const blogPageJs = read("js/blog-page.js");
const injectSiteMetaJs = read("scripts/inject-site-meta.mjs");
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
const blogBootstrapJs = read("js/blog-bootstrap.js");
const postPageJs = read("js/post-page.js");
const siteUtilsJs = read("js/site-utils.js");
const smokeCheckSource = read("scripts/smoke-check.mjs");
const smokeCheckModuleSources = [
  read("scripts/smoke-check/api-contracts.mjs"),
  read("scripts/smoke-check/blog-page.mjs"),
  read("scripts/smoke-check/content-modules.mjs"),
  read("scripts/smoke-check/harness.mjs"),
  read("scripts/smoke-check/image-proxy.mjs"),
  read("scripts/smoke-check/local-server-integration.mjs"),
  read("scripts/smoke-check/mobile-layout.mjs"),
  read("scripts/smoke-check/notion-api-client.mjs"),
  read("scripts/smoke-check/performance-contract.mjs"),
  read("scripts/smoke-check/particle-runtime.mjs"),
  read("scripts/smoke-check/public-content-notion.mjs"),
  read("scripts/smoke-check/routing-vercel.mjs"),
  read("scripts/smoke-check/server-modules.mjs"),
  read("scripts/smoke-check/spa-router.mjs"),
  read("scripts/smoke-check/tooling.mjs"),
];
const visualRegressionJs = read("scripts/visual-regression.mjs");
const apiNotionJs = read("api/notion.js");
const apiCoverJs = read("api/cover.js");
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
const serverImageProxyJs = read("server/image-proxy.js");
const serverBlockServiceJs = read("server/block-service.js");
const serverPostServiceJs = read("server/post-service.js");
const serverRenderServiceJs = read("server/render-service.js");
const serverNotionJs = read("server/notion-server.js");
await runToolingChecks({ assert });
const notionContentSharedHelpers = loadCommonJsModule("js/notion-content-shared.js");
const notionContentUtilsHelpers = loadCommonJsModule("js/notion-content-utils.js");
const notionContentUrlHelpers = loadCommonJsModule("js/notion-content-url.js");
const notionArticleRendererHelpers = loadCommonJsModule("js/notion-article-renderer.js");
const notionContentHelpers = loadCommonJsModule("js/notion-content.js");
const serverNotionConfigHelpers = loadCommonJsModule("server/notion-config.js");
const serverCategoryNavigationHelpers = loadCommonJsModule("server/category-navigation.js", [
  "normalizeCategoryGradient",
]);
const serverCacheStoreHelpers = loadCommonJsModule("server/cache-store.js");
const publicContentHelpers = loadCommonJsModule("server/public-content.js");
const securityPolicyHelpers = loadCommonJsModule("server/security-policy.js");
const apiNotionHandler = loadCommonJsModule("api/notion.js");
const apiCoverHandler = loadCommonJsModule("api/cover.js");
const apiImageHandler = loadCommonJsModule("api/image.js");
const {
  __test: imageProxyDefaultConfig,
} = loadCommonJsModule("server/image-proxy.js", [
  "IMAGE_PROXY_TIMEOUT_MS",
  "IMAGE_PROXY_MAX_BYTES",
  "IMAGE_PROXY_MAX_REDIRECTS",
]);
const apiPostHandler = loadCommonJsModule("api/post.js", [], {
  __parse5ForSmokeCheck: parse5ForSmokeCheck,
});
const apiRobotsHandler = loadCommonJsModule("api/robots.js");
const apiPostsDataHandler = loadCommonJsModule("api/posts-data.js");
const apiPostDataHandler = loadCommonJsModule("api/post-data.js");
const {
  __test: apiPostHelpers,
} = loadCommonJsModule("api/post.js", [
  "buildInitialPostPayload",
  "upsertStructuredDataScript",
  "injectInitialPostData",
  "replacePostContent",
  "replaceHeadMeta",
  "replaceEmptyStateContent",
], {
  __parse5ForSmokeCheck: parse5ForSmokeCheck,
});
const serverNotionHelpers = {
  ...loadCommonJsModule("server/notion-schema.js"),
  ...loadCommonJsModule("server/public-policy.js"),
  ...loadCommonJsModule("server/post-service.js"),
  ...loadCommonJsModule("server/notion-server.js"),
};

const appAssetVersionMatch = appJs.match(/const ASSET_VERSION = "([^"]+)";/);
assert.ok(appAssetVersionMatch, "app.js should declare a literal ASSET_VERSION");
const assetVersionValue = appAssetVersionMatch[1];
assert.ok(
  new RegExp(`^\\d{8}-${assetReleaseSuffix}-[a-f0-9]{12}$`).test(assetVersionValue),
  `asset version should include the package release suffix and deterministic 12-hex fingerprint for ${packageMetadata.version}`,
);
const smokeRootDir = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
assert.equal(
  assetVersionValue,
  computeExpectedAssetVersion(smokeRootDir, assetVersionValue),
  "ASSET_VERSION fingerprint should match all shipped JS, CSS, assets, and manifest content",
);
const assetVersion = `v=${assetVersionValue}`;
const defaultShareImagePath = SHARED_DEFAULT_SHARE_IMAGE_PATH;
const mobileStarfieldAssetUrl = `/assets/mobile-home-starry-bg.svg?${assetVersion}`;
assert.equal(
  (styleCss.match(new RegExp(escapeRegex(mobileStarfieldAssetUrl), "g")) || []).length,
  1,
  "mobile home starfield CSS URL should use one width-driven rule with the shared asset version",
);
expectNotIncludes(
  styleCss,
  "mobile-home-starry-bg.svg?v=20260516-v78",
  "mobile home starfield CSS URL should not keep stale release cache keys",
);
assert.equal(
  defaultShareImagePath,
  "/og-image.jpg?v=4",
  "DEFAULT_SHARE_IMAGE_PATH in notion-content-shared.js should remain in sync with the og-image asset on disk",
);
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
// Only version-controlled source is in scope for the hardcoding scan. Skip the
// gitignored top-level directories declared in .gitignore: they hold local-only
// state (editor/agent config such as `.claude/settings.local.json`, build
// output, Vercel metadata) that may legitimately reference the production domain
// and must not fail the guard. Keep this list in sync with .gitignore.
const skippedScanDirectories = new Set([
  ".git",
  ".vercel",
  ".claude",
  ".idea",
  ".vscode",
  "dist",
  ".output",
  "node_modules",
]);
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

// Prefer the git-tracked file set: the hardcoding guard only cares about
// version-controlled source, and asking git transparently excludes every
// gitignored path (.env, .claude/, node_modules/, build output, ...) without
// enumerating them — so a local run matches a clean CI checkout. Returns null
// when git is unavailable (e.g. a tarball download) so the caller falls back to
// the filesystem walk, where skippedScanDirectories does the filtering.
function listGitTrackedTextFiles() {
  let output;
  try {
    output = execFileSync("git", ["ls-files", "-z"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }

  return output
    .split("\0")
    .filter(Boolean)
    .filter((filePath) => (
      !skippedScanExtensions.has(path.extname(filePath).toLowerCase())
      && existsSync(filePath)
    ));
}

function listScannableProjectTextFiles() {
  return listGitTrackedTextFiles() || listProjectTextFiles();
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

const productionDomainFiles = listScannableProjectTextFiles().filter((filePath) => (
  productionDomainPattern.test(readFileSync(filePath, "utf8"))
));
assert.deepEqual(
  productionDomainFiles.filter((filePath) => !allowedProductionDomainFiles.has(filePath)),
  [],
  "production domain hardcoding should stay constrained to documented SEO fallback files",
);
assert.ok(!existsSync("robots.txt"), "robots.txt should be served dynamically through /api/robots");
assert.equal(siteConfig.siteUrl, configuredSiteOrigin, "site.config.json siteUrl should be a normalized origin without a trailing slash");
assert.ok(configuredSiteName, "site.config.json siteName should declare the public brand name");
assert.equal(
  serverNotionConfigHelpers.getSiteName(siteConfig),
  configuredSiteName,
  "server site-name helper should read site.config.json",
);
expectIncludes(serverNotionClientJs, "readConfiguredSiteOrigin(SITE_CONFIG)", "server site origin fallback should read site.config.json");
expectIncludes(serverNotionConfigJs, "function getSiteName", "server configuration should expose the configured site name");
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
  expectIncludes(htmlSource, `name="application-name" content="${configuredSiteName}"`, `${label} should expose the configured site name`);
  expectIncludes(htmlSource, `property="og:image:alt" content="${configuredSiteName}"`, `${label} should keep og:image:alt in sync with site.config.json`);
});
expectIncludes(indexHtml, `<title>${configuredSiteName}</title>`, "index.html title should follow site.config.json siteName");
expectIncludes(indexHtml, `content="${configuredSiteName} — 探索、记录、分享"`, "index.html description should follow site.config.json siteName");
expectIncludes(indexHtml, `<h1 class="hero-title" data-page-focus>${configuredSiteName}</h1>`, "index hero title should follow site.config.json siteName");
expectIncludes(blogHtml, `<title>总览 — ${configuredSiteName}</title>`, "blog.html title should follow site.config.json siteName");
expectIncludes(blogHtml, `property="og:title" content="总览 — ${configuredSiteName}"`, "blog.html og:title should follow site.config.json siteName");
expectIncludes(postHtml, `<title>文章 — ${configuredSiteName}</title>`, "post.html title should follow site.config.json siteName");
expectIncludes(postHtml, `property="og:title" content="${configuredSiteName}"`, "post.html fallback og:title should follow site.config.json siteName");
expectIncludes(injectSiteMetaJs, "readSiteName", "metadata injection should own static site-name hydration");

expectIncludes(indexHtml, 'property="og:image"', "index.html should declare og:image");
expectIncludes(blogHtml, 'property="og:image"', "blog.html should declare og:image");
expectIncludes(postHtml, 'property="og:image"', "post.html should declare og:image");
[
  ["index.html", indexHtml],
  ["blog.html", blogHtml],
  ["post.html", postHtml],
].forEach(([label, htmlSource]) => {
  expectIncludes(htmlSource, 'type="image/png" href="/favicon.png?v=4"', `${label} should keep the approved PNG favicon artwork`);
  expectIncludes(htmlSource, '<link rel="manifest" href="/manifest.webmanifest" />', `${label} should expose the standalone web app manifest`);
  expectIncludes(htmlSource, '<meta name="mobile-web-app-capable" content="yes" />', `${label} should opt into standalone mobile display when installed`);
  expectIncludes(htmlSource, '<meta name="apple-mobile-web-app-capable" content="yes" />', `${label} should opt into iOS standalone display when saved to home screen`);
  expectIncludes(htmlSource, '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />', `${label} should let the starfield extend under the standalone status bar`);
  expectIncludes(htmlSource, `<meta name="apple-mobile-web-app-title" content="${configuredSiteName}" />`, `${label} standalone title should follow site.config.json siteName`);
  expectNotIncludes(htmlSource, "favicon.svg", `${label} should not let a mismatched SVG favicon override the approved PNG artwork`);
});
assert.equal(webManifest.name, configuredSiteName, "web manifest name should follow site.config.json siteName");
assert.equal(webManifest.short_name, "Share", "web manifest should keep a compact launcher title");
assert.equal(webManifest.display, "standalone", "web manifest should request standalone display without the browser address bar");
assert.ok(!Object.prototype.hasOwnProperty.call(webManifest, "orientation"), "web manifest should allow installed apps to follow the user's device orientation");
assert.equal(webManifest.background_color, "#0a0e1a", "web manifest background should match the mobile safe-area background");
assert.equal(webManifest.theme_color, "#111528", "web manifest theme color should match the existing mobile browser chrome color");
assert.deepEqual(webManifest.icons, [
  {
    src: `/assets/icon-192.png?v=${assetVersionValue}`,
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  },
  {
    src: `/assets/icon-512.png?v=${assetVersionValue}`,
    sizes: "512x512",
    type: "image/png",
    purpose: "any",
  },
  {
    src: `/assets/icon-maskable-512.png?v=${assetVersionValue}`,
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
], "web manifest should expose correctly versioned standard and maskable PWA icons");
expectIncludes(localServerJs, '[".webmanifest", "application/manifest+json; charset=utf-8"]', "local dev server should serve the web manifest with the manifest MIME type");
expectIncludes(injectSiteMetaJs, "upsertStandaloneMetadata", "metadata injection should keep standalone mobile tags in sync");
expectIncludes(injectSiteMetaJs, "buildWebManifest", "metadata injection should keep the web manifest in sync with site config");
assert.equal(
  faviconPng.subarray(0, 8).toString("hex"),
  "89504e470d0a1a0a",
  "favicon.png should be a valid PNG asset",
);
assert.equal(faviconPng.readUInt32BE(16), 256, "favicon.png should keep the approved compact 256px width");
assert.equal(faviconPng.readUInt32BE(20), 256, "favicon.png should keep the approved compact 256px height");
assert.ok(faviconPng.length <= 40 * 1024, "favicon.png should stay small enough for the mobile critical path");
assert.equal(
  createHash("sha256").update(faviconPng).digest("hex"),
  "756d619b1e1f100d79ca20b18b91cfc356d1c650d99eac3b7c1f98f4e9534830",
  "favicon.png should match the approved compact brand artwork",
);
expectIncludes(mobileHomeStarryBgSvg, 'id="centerGlow"', "mobile home starfield should keep the centered static glow");
expectNotIncludes(mobileHomeStarryBgSvg, 'id="topWash"', "mobile home starfield should not bring back the top-left wash");
assert.deepEqual(readJpegDimensions(ogImageJpg, "og-image.jpg"), { width: 1200, height: 630 }, "og-image.jpg should use the standard Open Graph image size");
assert.ok(ogImageJpg.length <= 80 * 1024, "og-image.jpg should stay at or below the 80KB Task D budget");
expectIncludes(indexHtml, 'id="heroSearchForm"', "index.html should expose a real search form");
expectIncludes(indexHtml, 'action="/blog.html"', "index.html search should degrade to a real blog route");
expectIncludes(indexHtml, 'method="get"', "index.html search should work without JavaScript");
expectIncludes(indexHtml, 'maxlength="256"', "index.html should bound native search URLs to the public API contract");
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
expectIncludes(expectedStaticContentSecurityPolicy, "font-src 'self' data:", "shared CSP should keep fonts local or inline");
expectNotIncludes(expectedStaticContentSecurityPolicy, "fonts.googleapis", "shared CSP should not retain external Google Fonts CSS hosts");
expectNotIncludes(expectedStaticContentSecurityPolicy, "fonts.gstatic", "shared CSP should not retain external Google Fonts file hosts");
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
  expectNotIncludes(htmlSource, "fonts.googleapis", `${label} should not block first paint on external font CSS`);
  expectNotIncludes(htmlSource, "fonts.gstatic", `${label} should not fetch external font files`);
  expectNotIncludes(htmlSource, "font-loader.js", `${label} should not load the retired font loader`);

  expectIncludes(
    htmlSource,
    `<script type="module" src="/js/app.js?${assetVersion}" data-spa-runtime></script>`,
    `${label} should load the shared SPA runtime through its ES module entry`,
  );
  const expectedScriptCount = label === "blog.html" ? 2 : 1;
  assert.equal(
    Array.from(htmlSource.matchAll(/<script\b[^>]*\bsrc="\/js\//g)).length,
    expectedScriptCount,
    `${label} should expose only its intentional module entries`,
  );
});
assert.ok(
  blogHtml.indexOf('data-blog-bootstrap') < blogHtml.indexOf('data-spa-runtime'),
  "blog.html should start its dependency-free data bootstrap before the shared app entry",
);
const expectedAppStaticImports = [
  "./notion-content-shared.js",
  "./runtime-core.js",
  "./site-utils.js",
  "./common.js",
  "./ui-effects.js",
  "./seo-meta.js",
  "./spa-router.js",
];
const expectedAppDynamicImports = [
  "./blog-bootstrap.js",
  "./notion-content-utils.js",
  "./notion-content-url.js",
  "./notion-article-renderer.js",
  "./notion-content.js",
  "./notion-api.js",
  "./bookmark.js",
  "./index-page.js",
  "./blog-page.js",
  "./post-page.js",
];
const appStaticImports = Array.from(
  appJs.matchAll(/^import\s+"(\.\/[^"]+\.js)\?v=([^"]+)";$/gm),
);
assert.equal(
  appStaticImports.length,
  expectedAppStaticImports.length,
  "app.js should version every static side-effect module import",
);
expectedAppStaticImports.reduce((previousIndex, src) => {
  const importStatement = `import "${src}?${assetVersion}";`;
  const nextIndex = appJs.indexOf(importStatement);
  assert.ok(nextIndex > previousIndex, `app.js should statically import ${src} in dependency order with the shared asset version`);
  return nextIndex;
}, -1);
appStaticImports.forEach(([, src, version]) => {
  assert.ok(expectedAppStaticImports.includes(src), `app.js should not statically import unexpected module ${src}`);
  assert.equal(version, assetVersionValue, `${src} static import should use the shared asset version`);
});
const sharedModulePreloadHrefs = expectedAppStaticImports.map((src) => `/js/${src.slice(2)}?${assetVersion}`);
const pageModulePreloadPaths = {
  "index.html": ["index-page.js"],
  "blog.html": [
    "blog-bootstrap.js",
    "notion-content-utils.js",
    "notion-content-url.js",
    "notion-api.js",
    "bookmark.js",
    "blog-page.js",
  ],
  "post.html": [
    "notion-content-utils.js",
    "notion-content-url.js",
    "notion-article-renderer.js",
    "notion-content.js",
    "notion-api.js",
    "bookmark.js",
    "post-page.js",
  ],
};
pageHtmlByLabel.forEach(([label, htmlSource]) => {
  const modulePreloadHrefs = Array.from(
    htmlSource.matchAll(/<link\s+rel="modulepreload"\s+href="([^"]+)"\s*\/?>/g),
    (match) => match[1],
  );
  assert.deepEqual(
    modulePreloadHrefs,
    [
      ...sharedModulePreloadHrefs,
      ...pageModulePreloadPaths[label].map((filename) => `/js/${filename}?${assetVersion}`),
    ],
    `${label} should modulepreload its shared and page-specific dependency chains in order`,
  );
  assert.equal((htmlSource.match(/SITE_MODULE_PRELOADS_START/g) || []).length, 1, `${label} should have one preload start marker`);
  assert.equal((htmlSource.match(/SITE_MODULE_PRELOADS_END/g) || []).length, 1, `${label} should have one preload end marker`);
});
runPerformanceContractChecks({
  assert,
  pageHtmlByLabel,
  rootDir: smokeRootDir,
  sourceText: [indexHtml, blogHtml, postHtml, styleCss, blogPageCss, postPageCss, appJs].join("\n"),
});
const appDynamicImports = Array.from(
  appJs.matchAll(/import\(versioned\("(\.\/[^"]+\.js)"\)\)/g),
);
assert.equal(
  appDynamicImports.length,
  expectedAppDynamicImports.length,
  "app.js should lazy-import each page-specific module exactly once across its route-specific dependency chains",
);
const dynamicImportSet = new Set(appDynamicImports.map(([, src]) => src));
expectedAppDynamicImports.forEach((src) => {
  assert.ok(dynamicImportSet.has(src), `app.js should lazy-load ${src} through a page loader`);
});
expectIncludes(appJs, 'window.PageLoaders = pageLoaders', "app.js should expose page loaders so spa-router can lazy-load on navigation");
expectIncludes(appJs, "async function loadBlogDataChain", "app.js should keep the blog listing dependency chain explicit");
expectIncludes(appJs, "async function loadPostRenderingChain", "app.js should use a sequential loading helper to guarantee UMD dependency order");
expectIncludes(appJs, "await primeBlogInitialData(context).catch(() => null)", "app.js should finish starting blog data before the listing chain can issue a fallback request");
const blogLoaderSource = appJs.match(/blog:\s*async \(context = \{\}\) => \{([\s\S]*?)\n\s*\},\n\s*post:/)?.[1] || "";
assert.match(blogLoaderSource, /await loadBlogDataChain\(\)/, "blog route should load only the lightweight listing chain");
assert.doesNotMatch(blogLoaderSource, /loadPostRenderingChain/, "blog route should not load article rendering modules");
const postLoaderSource = appJs.match(/post:\s*async \(\) => \{([\s\S]*?)\n\s*\},\n\s*\};/)?.[1] || "";
assert.match(postLoaderSource, /await loadPostRenderingChain\(\)/, "post route should retain the complete article rendering chain");
expectIncludes(appJs, "const ASSET_VERSION =", "app.js should declare a single asset version constant for dynamic imports");
expectIncludes(appJs, "async function bootInitialPage", "app.js should keep initial page boot sequencing explicit");
expectIncludes(appJs, "markInitialPageLoadFailure", "app.js should record initial page module load failures");
expectIncludes(appJs, "window.NavigationFeedback?.show?.", "app.js should expose a visible retry when the initial page module fails");
assert.ok(
  appJs.indexOf("window.PageRuntime?.start?.();")
    < appJs.indexOf("} catch (error) {", appJs.indexOf("async function bootInitialPage")),
  "app.js should route initial PageRuntime init failures through its visible boot failure boundary",
);
expectNotIncludes(appJs, ".finally(() =>", "app.js should not start page runtime after a failed initial page module import");
expectIncludes(spaRouterJs, "window.PageLoaders?.[targetPageId]", "spa-router should call the matching page loader on navigation");
expectIncludes(spaRouterJs, "hasDocumentAssetVersionMismatch", "spa-router should reject cross-deployment DOM/runtime mixes");
expectIncludes(spaRouterJs, "preloadDocumentModules", "spa-router should adopt fetched route modulepreloads before page preparation");
expectIncludes(spaRouterJs, "isHashOnlyHistoryChange", "spa-router should preserve page-local hash history traversal");
expectNotIncludes(spaRouterJs, "function ensureScript", "spa-router should drop the legacy ensureScript helper now that page modules are dynamic imports");
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
expectIncludes(gitAttributes, "*.webmanifest text eol=lf", ".gitattributes should keep fingerprinted web manifests reproducible across platforms");
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
expectIncludes(styleCss, ".hero-search input:focus-visible", "home search should use focus-visible styling");
expectNotIncludes(styleCss, ".hero-search input:focus {", "home search should not show the focus ring for every pointer focus");
expectIncludes(blogPageCss, ".blog-search input:focus-visible", "blog search should use focus-visible styling");
expectNotIncludes(blogPageCss, ".blog-search input:focus {", "blog search should not show the focus ring for every pointer focus");
expectIncludes(blogPageCss, ".empty-state-hint", "blog page CSS should own empty-state hint typography");
expectIncludes(blogHtml, '<p class="empty-state-hint">', "blog.html should use the shared empty-state hint class");
expectIncludes(blogPageJs, 'class="empty-state-hint"', "blog page renderer should use the shared empty-state hint class");
expectNotIncludes(blogHtml, 'style="font-size: 0.85rem;"', "blog.html should not duplicate empty-state hint typography inline");
expectNotIncludes(blogPageJs, 'style="font-size: 0.85rem;"', "blog page renderer should not duplicate empty-state hint typography inline");
expectNotIncludes(postPageCss, "body[data-page=\"post\"] .fab-bookmark", "post-page CSS should not override bookmark visibility that JavaScript owns");
expectNotIncludes(postPageCss, "display: none !important", "post-page CSS should avoid forcing bookmark controls against JavaScript state");
expectIncludes(blogPageJs, "PRIORITY_COVER_IMAGE_COUNT = 1", "blog cards should preload at most one valid LCP cover candidate");
expectIncludes(blogPageJs, "findIndex((post) => resolveSafeCoverImage(post))", "blog cards should select the first real cover rather than prioritizing placeholders");
expectIncludes(blogPageJs, "renderCard(post, index === priorityCoverIndex)", "blog cards should give eager/high priority to exactly one real cover candidate");
expectIncludes(blogPageJs, "mobileDeviceQuery.matches", "blog cards should gate mobile image policy through the shared mobile query");
expectIncludes(blogPageJs, "resolveSafeCoverImage(post)", "blog cards should use display-safe cover URLs instead of share-image fallbacks");
expectIncludes(blogPageJs, 'loading="${coverLoading}"', "blog cards should keep lazy loading off the first visible covers");
expectIncludes(blogPageJs, 'fetchpriority="${coverFetchPriority}"', "blog cards should assign browser fetch priority to cover images");
expectIncludes(blogPageJs, "preloadCoverImages(data.results)", "blog cards should preload the first visible cover images after list data arrives");
expectIncludes(blogPageJs, 'data-blog-cover-preload', "blog cards should mark temporary cover preload links for cleanup");
expectIncludes(blogPageJs, 'window.addEventListener?.("bookmarks:updated", handleBookmarksUpdated)', "blog page should listen for cross-tab bookmark updates");
expectNotIncludes(blogPageJs, "@canonical-source", "blog page should not keep dead local copies of shared helper fallbacks");
expectIncludes(blogPageJs, "function createListingContentFacade()", "blog page should make its lightweight content dependencies explicit");
expectIncludes(blogPageJs, "const sanitizeCssColor = LISTING_CONTENT.sanitizeCssColorValue;", "blog page should call the lightweight CSS sanitizer directly");
expectIncludes(blogPageJs, "const normalizeBookmarkSearchQuery = LISTING_CONTENT.normalizeSearchText;", "blog page should call the lightweight search normalizer directly");
expectIncludes(blogPageJs, "const buildSharedPostSearchText = LISTING_CONTENT.buildPostSearchText;", "blog page should call the lightweight search text builder directly");
expectNotIncludes(blogPageJs, "window.NotionContent;", "blog page should not require the full article renderer at module initialization");
expectIncludes(blogPageJs, "const parseBookmarkListingHash = siteUtils.parseBookmarkListingHash;", "blog page should rely on the shared bookmark hash parser");
expectIncludes(blogPageJs, "const buildBookmarkListingUrl = siteUtils.buildBookmarkListingUrl;", "blog page should rely on the shared bookmark route builder");
expectIncludes(blogPageJs, "PUBLIC_CATEGORY_QUERY_MAX_LENGTH = 128", "blog page should cap category query state to match the public API");
expectIncludes(blogPageJs, "PUBLIC_SEARCH_QUERY_MAX_LENGTH = 256", "blog page should cap search query state to match the public API");
expectIncludes(siteUtilsJs, "normalizeBookmarkSearch", "SiteUtils should cap bookmark-listing search state before emitting hash routes");
expectIncludes(blogPageJs, "siteUtils.getSiteName", "blog page metadata should read the configured site name");
expectIncludes(blogPageJs, "error?.retryAfter", "blog page load failures should surface Retry-After seconds when available");
expectIncludes(notionApiJs, 'response.headers?.get?.("retry-after")', "Notion API client should propagate Retry-After response headers to UI errors");
expectIncludes(blogPageJs, "blog-card-cover-fallback", "blog cards should show a stable fallback while remote covers load");
expectNotIncludes(blogPageJs, ">${safeCoverEmoji}</span>", "blog cover fallback should not render the notebook emoji as visible placeholder text");
expectIncludes(blogPageCss, ".blog-card-cover-fallback", "blog card cover CSS should keep fallback art visible until the image paints");
expectNotIncludes(blogPageCss, "border-bottom: 1px solid var(--glass-border);", "blog card covers should not draw a bottom hairline under cover images");
expectIncludes(blogPageCss, "z-index: 2;\n  border-radius: inherit;", "blog card link layer should stay above cover media");
expectIncludes(blogPageCss, "pointer-events: none;\n}", "blog card cover media should not swallow clicks meant for the card link");
expectIncludes(blogPageCss, "z-index: 3;\n  display: inline-flex;", "blog card bookmark button should stay above the card link layer");
expectIncludes(commonJs, 'Object.freeze({ name: "high", count: 350', "particle runtime should preserve the full desktop particle density");
expectIncludes(commonJs, 'Object.freeze({ name: "balanced", count: 220', "particle runtime should provide a visually dense intermediate tier");
expectIncludes(commonJs, 'Object.freeze({ name: "economy", count: 120', "particle runtime should provide a bounded low-cost tier");
expectIncludes(commonJs, "siteUtils.isNarrowViewport", "particle runtime should gate work by available width rather than pointer type");
expectNotIncludes(commonJs, "siteUtils.isMobileDeviceViewport", "particle runtime must not animate behind narrow fine-pointer layouts");
expectIncludes(commonJs, "window.navigator?.connection?.saveData", "particle runtime should honor the data-saver preference");
expectIncludes(commonJs, 'reason: disabledReason || (tierIndex > 0 ? "low-hardware"', "particle runtime should downgrade low-capability hardware");
expectIncludes(commonJs, "recordParticleFrameCost", "particle runtime should adapt to sustained rendering cost");
expectIncludes(commonJs, 'applyAdaptiveParticleTier(adaptiveParticleTierIndex + 1, "frame-pressure")', "particle runtime should progressively reduce work under frame pressure");
expectIncludes(commonJs, 'getProfile: () => Object.freeze({ ...particleProfile })', "particle runtime should expose immutable diagnostics for browser checks");
expectIncludes(commonJs, "bucketArrays[color] = [];", "particle buckets should grow densely instead of preallocating holey arrays");
expectNotIncludes(commonJs, "bucketArrays[color] = Array(particleCount)", "particle buckets should not allocate holey arrays for every color");
expectIncludes(commonJs, 'createMediaQueryList("(prefers-reduced-motion: reduce)")', "particle runtime should observe the operating-system motion preference");
expectIncludes(commonJs, "bindReducedMotionChange(handleParticleContextChange)", "particle runtime should react when the motion preference changes");
expectIncludes(commonJs, 'connection?.addEventListener?.("change", handleParticleContextChange)', "particle runtime should react when data-saver state changes");
expectNotIncludes(commonJs, "shouldReduceMobileParticles", "particle runtime should avoid reduced-motion gates in the particle loop");
expectNotIncludes(commonJs, "particlesPausedForScroll", "particle runtime should not keep mobile scroll-pause state after disabling mobile particles");
expectNotIncludes(commonJs, "pauseMobileParticlesDuringScroll", "particle runtime should not attach mobile scroll particle work");
runParticleRuntimeChecks();
expectIncludes(siteUtilsJs, 'MOBILE_DEVICE_QUERY = "(max-width: 768px) and (hover: none) and (pointer: coarse)"', "site utils should centralize the real-mobile device query");
expectIncludes(siteUtilsJs, 'MOBILE_DEVICE_CLASS = "is-mobile-device-viewport"', "site utils should expose a JS fallback class for mobile browsers with broken pointer media queries");
expectIncludes(siteUtilsJs, "hasTouchInput", "site utils should fall back to touch capability for Brave/vivo mobile detection");
expectIncludes(siteUtilsJs, 'createMediaQueryList("(any-pointer: fine)")', "legacy touch-event fallback should not misclassify a fine-pointer narrow viewport");
expectIncludes(siteUtilsJs, "syncMobileDeviceViewportClass", "site utils should keep the mobile compatibility class in sync");
expectIncludes(siteUtilsJs, "createMobileDeviceQueryList", "site utils should expose a reusable mobile media query helper");
expectIncludes(siteUtilsJs, "isNarrowViewport,", "site utils should expose the geometry-only viewport gate");
expectIncludes(styleCss, "@media (max-width: 768px) {", "shared structure should reflow for every narrow viewport");
expectIncludes(styleCss, "@media (prefers-reduced-motion: reduce)", "shared CSS should provide a reduced-motion presentation contract");
expectIncludes(blogPageCss, "@media (max-width: 768px) {", "blog structure should reflow for narrow fine-pointer and touch viewports alike");
expectIncludes(postPageCss, "@media (max-width: 768px) {", "post structure should reflow for narrow fine-pointer and touch viewports alike");
expectIncludes(blogPageCss, "@media (max-width: 768px) and (hover: none) and (pointer: coarse)", "blog touch-only effects should retain a capability gate");
expectIncludes(postPageCss, "@media (max-width: 768px) and (hover: none) and (pointer: coarse)", "post touch-only effects should retain a capability gate");
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
expectNotIncludes(styleCss, 'html.is-mobile-device-viewport body[data-page="post"] .top-actions', "generated pointer fallbacks must not own post structure");
expectNotIncludes(blogPageCss, "html.is-mobile-device-viewport .blog-grid", "generated pointer fallbacks must not own blog grid reflow");
runMobileLayoutChecks({ assert, blogPageCss, postPageCss, styleCss });
expectNotIncludes(postPageCss, 'html.is-mobile-device-viewport body[data-page="post"] .page-transition-wrapper', "generated pointer fallbacks must not own post width clamps");
expectIncludes(postPageCss, "MOBILE_FALLBACKS_START", "post CSS should start one explicit generated fallback range");
expectIncludes(postPageCss, "MOBILE_FALLBACKS_END", "post CSS should close its generated fallback range");
expectIncludes(styleCss, "display: none;", "post mobile dock should be hidden for clean reading");
expectIncludes(postPageCss, 'body[data-page="post"] .page-transition-wrapper', "post mobile CSS should clamp article layout wrappers to the viewport");
expectIncludes(postPageJs, "if (element === navBookmark)", "post page should keep the nav bookmark hidden so the floating fab is the sole entry point on every viewport");
expectIncludes(styleCss, "@media (hover: none) and (pointer: coarse)", "cursor glow should be disabled only for touch-first pointers");
expectNotIncludes(styleCss, "@media (hover: none), (pointer: coarse)", "cursor glow touch fallback should not use a broad OR media query");
expectNotIncludes(postPageJs, 'createMediaQueryList("(max-width: 768px)")', "post page should not treat narrow desktop windows as mobile");
expectIncludes(blogPageCss, "opacity 0.3s ease", "blog cards should use shorter reveal transitions on mobile");
expectIncludes(blogPageJs, 'window.scrollTo({ top: 0, behavior: "auto" });', "blog pagination should avoid smooth-scroll jank on mobile");
expectIncludes(notionApiJs, "POSTS_RESPONSE_CACHE_TTL", "notion client should keep a short in-memory list cache for fast returns");
const notionClientBudgetMatch = /PUBLIC_CONTENT_REQUEST_TIMEOUT_MS\s*=\s*([\d_]+)/.exec(notionApiJs);
const bootstrapBudgetMatch = /PUBLIC_CONTENT_REQUEST_TIMEOUT_MS\s*=\s*([\d_]+)/.exec(blogBootstrapJs);
const serverOperationBudgetMatch = /MAX_NOTION_OPERATION_TIMEOUT_MS\s*=\s*([\d_]+)/.exec(serverNotionClientJs);
assert.ok(notionClientBudgetMatch, "notion client should declare its public-content request budget");
assert.ok(bootstrapBudgetMatch, "blog bootstrap should declare its public-content request budget");
assert.ok(serverOperationBudgetMatch, "server notion client should declare its maximum total operation budget");
const notionClientBudgetMs = Number(notionClientBudgetMatch[1].replaceAll("_", ""));
const bootstrapBudgetMs = Number(bootstrapBudgetMatch[1].replaceAll("_", ""));
const serverOperationBudgetMs = Number(serverOperationBudgetMatch[1].replaceAll("_", ""));
assert.equal(bootstrapBudgetMs, notionClientBudgetMs, "bootstrap and Notion client budgets should stay synchronized");
assert.ok(
  notionClientBudgetMs >= serverOperationBudgetMs + 5_000,
  "browser public-content requests should outlive the complete server Notion operation budget",
);
expectIncludes(notionApiJs, "POST_SUMMARY_MEMORY_CACHE_LIMIT = 200", "notion client should bound browser-side post summary memory");
expectIncludes(notionApiJs, "rememberPostSummaryInMemory", "notion client should centralize post summary memory LRU updates");
expectIncludes(notionApiJs, "postSummaryMemoryCache.keys().next().value", "notion client should evict the oldest in-memory post summary");
expectNotIncludes(notionApiJs, "_searchText:", "notion client should not reintroduce derived search text into public summary objects");
expectNotIncludes(bookmarkJs, "_searchText:", "bookmark manager should not persist derived search text in localStorage");
expectIncludes(notionContentJs, "IMAGE_PROXY_PATH", "shared notion content should proxy remote display images through the same-origin image endpoint");
expectIncludes(notionContentUrlJs, "COVER_IMAGE_PATH = \"/api/cover\"", "shared notion URL helpers should expose the cover thumbnail endpoint");
expectIncludes(notionContentUrlJs, "buildCoverImageSrcSet", "shared notion URL helpers should build responsive cover srcsets");
expectIncludes(siteUtilsJs, "resolveCoverImageUrl", "SiteUtils should expose cover-specific image URLs");
expectIncludes(blogPageJs, "COVER_IMAGE_SIZES", "blog cards should declare responsive image sizes for covers");
expectIncludes(blogPageJs, "imagesrcset", "blog cover preloads should advertise responsive srcsets");
expectIncludes(blogPageJs, 'srcset="${esc(safeCoverImageSrcSet)}"', "blog cards should render responsive cover srcsets");
expectIncludes(blogPageJs, 'sizes="${COVER_IMAGE_SIZES}"', "blog cards should render responsive cover sizes");
expectIncludes(apiCoverJs, "sharp", "cover endpoint should use sharp for real thumbnail generation");
expectIncludes(apiCoverJs, "COVER_IMAGE_WIDTHS = Object.freeze([320, 640, 960])", "cover endpoint should constrain generated thumbnail widths");
expectIncludes(apiCoverJs, "COVER_IMAGE_CACHE_CONTROL", "cover endpoint should own a long edge-cache policy for generated thumbnails");
expectIncludes(apiImageJs, "IMAGE_PROXY_CACHE_CONTROL", "image proxy endpoint should cache successful image responses at the edge");
expectIncludes(serverImageProxyJs, 'readPositiveIntegerEnv("IMAGE_PROXY_TIMEOUT_MS", 10_000)', "image proxy timeout should be configurable while keeping its default");
expectIncludes(serverImageProxyJs, 'readPositiveIntegerEnv("IMAGE_PROXY_MAX_BYTES", 8 * 1024 * 1024)', "image proxy size limit should be configurable while keeping its default");
expectIncludes(serverImageProxyJs, 'readNonNegativeEnvInteger("IMAGE_PROXY_MAX_REDIRECTS", 4)', "image proxy redirect limit should be configurable while keeping its default");
expectIncludes(packageJson, '"dev": "node scripts/local-server.mjs"', "package scripts should expose the local API-aware dev server");
expectNotIncludes(localServerJs, "async function readRequestBody", "read-only local APIs should never aggregate unsupported request bodies in memory");
expectIncludes(localServerJs, "req.resume();", "local dev server should drain unsupported request bodies without buffering them");
expectIncludes(localServerJs, "body: undefined", "local dev server should expose no body surface to read-only API handlers");
expectIncludes(packageJson, '"notion:live-check": "node scripts/notion-live-check.mjs"', "package scripts should expose the optional live Notion integration check");
expectIncludes(packageJson, '"mobile:fallbacks": "node scripts/build-mobile-fallbacks.mjs"', "package scripts should expose the mobile fallback generator");
expectIncludes(packageJson, '"check": "npm run lint && npm run architecture:check && node scripts/build-mobile-fallbacks.mjs --check && node scripts/inject-site-meta.mjs --check && node scripts/smoke-check.mjs"', "package check should run static and architecture analysis before generated assets and smoke checks");
assert.equal(packageMetadata.private, true, "deployment-only package metadata should prevent accidental npm publication");
const buildMobileFallbacksJs = read("scripts/build-mobile-fallbacks.mjs");
expectIncludes(buildMobileFallbacksJs, "isKeyframeStep", "mobile fallback generator should skip prefixing keyframe step selectors");
expectIncludes(buildMobileFallbacksJs, "keyframes", "mobile fallback generator should recognize @keyframes at-rules when filtering keyframe steps");
for (const cssFile of ["css/style.css", "css/blog-page.css", "css/post-page.css"]) {
  const cssSource = read(cssFile);
  assert.equal(
    /html\.is-mobile-device-viewport\s+(?:\d+%|from\b|to\b)/.test(cssSource),
    false,
    `${cssFile} should never contain html.is-mobile-device-viewport prefixed onto a keyframe step`,
  );
}
expectIncludes(packageJson, '"visual:check": "node scripts/visual-regression.mjs"', "package scripts should expose the browser visual regression check");
expectIncludes(packageJson, '"assets:stamp": "node scripts/stamp-asset-version.mjs"', "package scripts should expose deterministic asset stamping");
expectIncludes(packageJson, '"assets:sync": "npm run mobile:fallbacks && npm run meta:inject && npm run assets:stamp"', "package scripts should expose the ordered generated-asset workflow");
expectIncludes(packageJson, '"verify:release": "node scripts/release-check.mjs"', "package scripts should expose the strict release check");
expectIncludes(packageJson, '"license": "MIT"', "package metadata should match the published README license");
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
assert.equal(
  packageMetadata.engines?.node,
  "^22.13.0 || ^24.0.0",
  "package engines should match the Node lines actually exercised by CI",
);
assert.equal(packageMetadata.packageManager, "npm@11.9.0", "package metadata should pin the npm release used for reproducible installs");
assert.equal(packageMetadata.devDependencies?.postcss, "8.5.19", "PostCSS should stay on the audited exact patch release");
assert.equal(
  typeof packageMetadata.dependencies?.sharp,
  "string",
  "package.json should keep sharp as a production dependency for cover thumbnail generation",
);
expectIncludes(
  readmeMd,
  "node-22.13--22.x%20%7C%2024.x",
  "README badge should advertise the supported Node engine ranges",
);
expectIncludes(
  readmeMd,
  "Node.js](https://nodejs.org/) 22.13.0–22.x，或 24.x",
  "README prerequisites should match package engines",
);
expectIncludes(readmeMd, "npm.cmd ci", "README should document clean lockfile installation on Windows");
expectIncludes(readmeMd, "npm ci", "README should document clean lockfile installation on macOS and Linux");
expectIncludes(siteArchitectureMd, "exact Node 22.13.0 lower boundary and Node 24", "architecture docs should describe the current release-check Node matrix boundary");
expectIncludes(releaseCheckWorkflowYml, 'node-version: ["22.13.0", 24]', "release workflow should test the exact Node 22 lower boundary and current Node 24 line");
expectIncludes(releaseCheckWorkflowYml, 'NPM_VERSION: "11.9.0"', "release workflow should pin the declared npm toolchain version");
expectIncludes(releaseCheckWorkflowYml, 'npm install --global "npm@$NPM_VERSION"', "release workflow should activate the pinned npm version before clean install");
expectIncludes(releaseCheckWorkflowYml, "browser-contract:", "release workflow should include the cross-platform browser contract job");
expectIncludes(releaseCheckWorkflowYml, 'VISUAL_SKIP_DIFF: "1"', "CI browser contract should avoid platform-specific pixel comparisons");
expectIncludes(releaseCheckWorkflowYml, 'VISUAL_STRICT: "1"', "CI browser contract should fail closed when browser assertions cannot run");
expectIncludes(releaseCheckWorkflowYml, "permissions:\n  contents: read", "release workflow should keep the token read-only");
expectIncludes(releaseCheckWorkflowYml, "persist-credentials: false", "release workflow should not retain unused checkout credentials");
expectIncludes(releaseCheckWorkflowYml, "npm audit --audit-level=high", "release workflow should reject high-severity dependency advisories");
expectIncludes(
  releaseCheckWorkflowYml,
  "actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0",
  "release workflow should pin the reviewed checkout action release",
);
expectIncludes(
  releaseCheckWorkflowYml,
  "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0",
  "release workflow should pin the reviewed setup-node action release",
);
expectNotIncludes(releaseCheckWorkflowYml, "node-version: [18, 20, 22]", "release workflow should drop EOL Node versions");
expectIncludes(releaseCheckWorkflowYml, "node-version: ${{ matrix.node-version }}", "release workflow should use the Node matrix value");
expectNotIncludes(releaseCheckWorkflowYml, 'node-version: "20"', "release workflow should not pin checks to Node 20 only");
expectNotIncludes(releaseCheckWorkflowYml, "master", "release workflow should not keep a dead master branch trigger");
expectIncludes(localServerJs, 'await loadDotEnvFile(path.join(rootDir, ".env"));', "local server should load .env before reading runtime configuration");
expectIncludes(localServerJs, 'import { loadDotEnvFile } from "./lib/dotenv.mjs";', "local server should delegate .env parsing to the shared helper");
const dotenvHelperJs = read("scripts/lib/dotenv.mjs");
expectIncludes(dotenvHelperJs, "Object.prototype.hasOwnProperty.call(env, key)", "shared dotenv helper should not override shell-provided environment variables with .env values");
expectIncludes(localServerJs, '["/api/cover", "../api/cover.js"]', "local server should expose the cover thumbnail handler");
expectIncludes(localServerJs, '["/api/robots", "../api/robots.js"]', "local server should expose the dynamic robots handler");
expectIncludes(localServerJs, "write(payload)", "local server response shim should support streaming API handlers");
expectIncludes(localServerJs, "destroy()", "local server response shim should support aborting interrupted streamed responses");
expectIncludes(localServerJs, "get writableEnded()", "local server response shim should expose native completion state to request lifecycles");
expectIncludes(localServerJs, "get finished()", "local server response shim should expose the legacy native completion state");
expectIncludes(localServerJs, "removeListener(eventName, listener)", "local server response shim should allow request lifecycles to detach close listeners");
expectIncludes(localServerJs, "function getApiHandler", "local server should lazy-load API handlers by route");
expectNotIncludes(localServerJs, '["/api/post", require("../api/post.js")]', "local server should not eager-load every API handler at startup");
expectIncludes(localServerJs, "function isDeniedStaticPath", "local server should centralize static denylist checks");
expectIncludes(localServerJs, 'new Set(["api", "node_modules", "server", "scripts"])', "local server should deny source directories from static serving");
expectIncludes(localServerJs, 'segment.startsWith(".")', "local server should deny dotfiles including .env and .git paths");
expectIncludes(localServerJs, 'url.pathname === "/robots.txt"', "local server should map robots.txt to the dynamic handler");
expectIncludes(localServerJs, "VISUAL_REGRESSION_STATIC_TEMPLATES", "local server should expose static templates only for visual regression");
expectIncludes(visualRegressionJs, "Page.captureScreenshot", "visual regression should capture real browser screenshots");
expectIncludes(visualRegressionJs, "Emulation.setDeviceMetricsOverride", "visual regression should emulate mobile and desktop viewports");
expectIncludes(visualRegressionJs, "is-mobile-device-viewport", "visual regression should verify the mobile compatibility class");
expectIncludes(visualRegressionJs, "desktop particles should remain animated", "visual regression should guard desktop particle animation");
expectIncludes(visualRegressionJs, "mobile home particles should be disabled", "visual regression should guard mobile home particle removal");
expectIncludes(visualRegressionJs, "mobile blog bookmark button should compute to 21px width", "visual regression should guard mobile card bookmark sizing");
expectIncludes(visualRegressionJs, "mobile post top dock should stay hidden", "visual regression should guard mobile article dock visibility");
expectIncludes(visualRegressionJs, "checkNarrowDesktopHomeReflow", "visual regression should exercise the 320 CSS px desktop home-title contract");
expectIncludes(visualRegressionJs, "narrow desktop 320px home title text must fit its content box", "narrow desktop browser coverage should fail when the home title is clipped");
expectIncludes(visualRegressionJs, "checkNarrowDesktopBlogReflow", "visual regression should exercise the 320 CSS px desktop reflow contract");
expectIncludes(visualRegressionJs, "narrow desktop 320px blog should not overflow the root viewport", "narrow desktop browser coverage should fail on horizontal clipping");
expectIncludes(visualRegressionJs, "assertNarrowDesktopContext", "narrow desktop browser coverage should centralize device-shape assertions");
expectIncludes(visualRegressionJs, "userAgentDataMobile", "narrow desktop browser coverage should verify desktop UA client hints when available");
expectIncludes(visualRegressionJs, "await scenario.afterCaptureCheck?.(client)", "structural browser checks should run without changing committed screenshot baselines");
expectIncludes(visualRegressionJs, "waitForSemanticReadiness", "visual regression should poll semantic page readiness instead of sleeping after load");
expectIncludes(visualRegressionJs, 'busy === "false"', "visual regression should wait for the blog grid to finish loading");
expectIncludes(visualRegressionJs, "settledCardCount === 3", "visual regression should wait for representative blog card reveals to settle");
expectIncludes(visualRegressionJs, 'blockCount >= 8', "visual regression should wait for complete representative post content");
expectIncludes(visualRegressionJs, 'skeletonDisplay === "none"', "visual regression should wait for post skeleton completion");
expectIncludes(visualRegressionJs, "document.getAnimations({ subtree: true })", "visual regression should inspect active CSS animations before capture");
expectIncludes(visualRegressionJs, "animation instanceof CSSTransition", "visual regression should wait for finite CSS transitions as well as keyframe animations");
expectIncludes(visualRegressionJs, "iterations !== Infinity", "visual regression should ignore infinite decorative CSS animations");
expectIncludes(visualRegressionJs, "const FINITE_MOTION_TIMEOUT_MS = 4_000", "visual regression should bound finite CSS motion settling");
expectIncludes(visualRegressionJs, "const BROWSER_READY_TIMEOUT_MS = 30_000", "visual regression should tolerate bounded shared-runner Chrome cold starts");
expectIncludes(visualRegressionJs, "if (isStrictVisualMode()) throw new Error(message)", "strict visual mode should fail when finite CSS motion does not settle");
expectNotIncludes(visualRegressionJs, "await sleep(900)", "visual regression should not rely on a fixed post-load delay");
expectIncludes(visualRegressionJs, "Missing visual baseline:", "visual regression should identify missing pixel baselines explicitly");
expectIncludes(visualRegressionJs, "throw markVisualRegressionFailure(new Error(message))", "strict visual mode should fail closed when a baseline is missing");
expectIncludes(
  read("scripts/visual-baselines/approve.mjs"),
  'VISUAL_STRICT: "1"',
  "visual baseline approval should require strict semantic browser capture",
);
expectIncludes(
  read("scripts/visual-baselines/generate.mjs"),
  'VISUAL_STRICT: "1"',
  "visual baseline generation should require strict semantic browser capture",
);
expectIncludes(
  read("scripts/visual-baselines/generate.mjs"),
  "VISUAL_BASELINE_MAX_SAMPLE_DIFF_RATIO",
  "visual baseline generation should reject non-convergent sample sets",
);
expectIncludes(
  visualRegressionJs,
  "Page.addScriptToEvaluateOnNewDocument",
  "visual capture should seed nondeterministic runtime state before page scripts execute",
);
expectIncludes(
  visualRegressionJs,
  "stabilizeInfiniteCssMotion",
  "visual capture should freeze infinite CSS motion only after behavior checks",
);
for (const scenarioName of VISUAL_SCENARIO_NAMES) {
  assert.ok(
    existsSync(path.join(smokeRootDir, "scripts/visual-baselines", `${scenarioName}.png`)),
    `visual scenario ${scenarioName} should have a committed pixel baseline`,
  );
}
expectIncludes(visualRegressionJs, 'client.command("Browser.close"', "visual regression should close Chrome through CDP before removing its profile");
expectIncludes(visualRegressionJs, "removeTemporaryDirectory", "visual regression should retry transient Windows profile locks");
expectIncludes(visualRegressionJs, "async function cleanupBrowserResources", "visual regression should centralize bounded process and profile cleanup");
expectIncludes(visualRegressionJs, "async function stopWindowsBrowserProcesses", "Windows visual cleanup should terminate the spawned browser tree and profile-specific orphan processes");
expectIncludes(visualRegressionJs, "Get-CimInstance Win32_Process", "Windows visual cleanup should identify orphan browsers by the unique temporary profile path");
expectIncludes(visualRegressionJs, "catch (startupError)", "visual browser startup should own partial-startup failure cleanup");
expectIncludes(visualRegressionJs, "await cleanupBrowserResources(child, profileDir)", "all visual browser paths should terminate the child before deleting its profile");
expectIncludes(visualRegressionJs, "finally {\n    try {\n      await cleanupBrowserResources(child, profileDir);", "command-line screenshot failures and timeouts should always clean their browser profile");
expectIncludes(readmeMd, `badge/version-${packageMetadata.version}`, "README badge should match package version");
expectNotIncludes(readmeMd, "badge/version-4.7.0", "README badge should not keep stale release metadata");
expectIncludes(readmeMd, "npm.cmd run visual:check", "README should document the browser visual regression check");
expectIncludes(readmeMd, "VISUAL_STRICT=1", "README should document strict visual regression mode");
expectIncludes(readmeMd, "npm test` 与 `npm.cmd run check` 等价", "README should document that npm test stays a fast smoke check");
expectIncludes(readmeMd, "并行运行完整快速门禁和 `VISUAL_STRICT=1`", "README should document parallel strict release checks");
expectIncludes(readmeMd, "GitHub Actions 在 Node 22.13.0 边界与 Node 24 上运行快速门禁和高危依赖公告审计", "README should document the CI browser and dependency gates");
expectIncludes(readmeMd, "VISUAL_SKIP_DIFF=1", "README should distinguish the cross-platform browser contract from pixel baselines");
expectNotIncludes(readmeMd, "GitHub Actions 当前只跑 `npm run check`", "README should not retain the resolved CI visual gap");
expectIncludes(siteArchitectureMd, `> Version: ${releaseVersion}`, "architecture docs should match the next release commit");
expectIncludes(siteArchitectureMd, `Version ${releaseVersion} Highlights`, "architecture docs should describe the current release");
expectNotIncludes(siteArchitectureMd, "> Version: v4.7", "architecture docs should not keep stale release metadata");
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
expectIncludes(siteArchitectureMd, "runs ESLint, `scripts/architecture-check.mjs`", "architecture docs should describe the complete fast quality gate");
expectIncludes(siteArchitectureMd, "strict Linux Chrome browser contract", "architecture docs should describe the CI browser contract");
expectIncludes(siteArchitectureMd, "full Windows pixel baseline", "architecture docs should distinguish the local pixel release contract");
expectNotIncludes(siteArchitectureMd, "cross-platform visual baseline gap remains tracked", "architecture docs should not retain the resolved CI gap");
expectIncludes(siteArchitectureMd, "`image-proxy.mjs` for HMAC source authorization", "architecture docs should list focused image-boundary checks");
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
expectIncludes(localServerJs, "url: req.url", "local API request shims should preserve the raw URL for canonical validation");
expectIncludes(localServerJs, "once: req.once.bind(req)", "local API request shims should forward disconnect listeners");
expectIncludes(localServerJs, "removeListener: req.removeListener.bind(req)", "local API request shims should support lifecycle listener cleanup");
expectIncludes(localServerJs, "return req.aborted", "local API request shims should expose the underlying aborted state");
expectIncludes(
  read("server/canonical-query.js"),
  'typeof req?.url !== "string" || !req.url) return false',
  "canonical query validation should fail closed when an adapter omits the raw URL",
);
expectNotIncludes(spaRouterJs, "script[src]:not([data-spa-runtime])", "SPA router should not scan HTML script tags now that page modules go through PageLoaders");
expectIncludes(spaRouterJs, "StructuredData?.syncFromDocument", "SPA router should carry SSR JSON-LD into the active document during navigation");
expectIncludes(spaRouterJs, "waitForRouteExitCue", "SPA router should preserve the v1.6-style route exit cue");
expectIncludes(spaRouterJs, "ROUTE_EXIT_CUE_MS = 150", "SPA router should keep the old quick route exit pause");
expectIncludes(spaRouterJs, "ROUTE_NETWORK_TIMEOUT_MS = 15000", "SPA router should give HTML transport its own bounded deadline");
expectIncludes(spaRouterJs, "ROUTE_PREPARE_TIMEOUT_MS = 10000", "SPA router should give module/style preparation a separate bounded deadline");
expectIncludes(spaRouterJs, "restoreCurrentPage(content, currentToken)", "SPA router deadline failures should restore the existing interactive page");
expectIncludes(spaRouterJs, "pendingPageFetches", "SPA router should coalesce in-flight page HTML prefetch and navigation requests");
expectIncludes(spaRouterJs, "MAX_PENDING_PAGE_FETCHES = 4", "SPA router should cap concurrent cacheable page fetches");
expectIncludes(spaRouterJs, "pendingPageFetches.size >= MAX_PENDING_PAGE_FETCHES", "SPA router should skip new warm prefetches once pending fetches are saturated");
expectIncludes(spaRouterJs, "function isSameOriginUrl(url)", "SPA warmup should compare parsed origins instead of URL prefixes");
expectIncludes(spaRouterJs, "cacheKey === getPageCacheKey(activePageUrl)", "SPA warmup should skip the active page");
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
expectIncludes(styleCss, "prefers-reduced-motion: reduce", "CSS should reduce ambient and route motion when the user requests it");
expectIncludes(spaRouterJs, "pointerEvents = \"none\"", "SPA router should avoid interactions during route transitions");
expectIncludes(spaRouterJs, "content.style.pointerEvents = \"\"", "SPA navigation recovery should restore interactions on the existing page");
expectIncludes(spaRouterJs, "url: targetUrl.href,\n                signal: navigationController.signal", "SPA page loaders should receive the target URL and cancellation signal");
expectNotIncludes(spaRouterJs, "window.location.href = getNavigationFallbackUrl", "SPA failures should keep the current page instead of forcing a second navigation");
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
      resolveCoverImageUrl: (value, baseOrigin, { width = 640 } = {}) => {
        if (!value || typeof value !== "string") return null;
        const parsed = new URL(value, baseOrigin);
        if (parsed.origin === new URL(baseOrigin).origin) return parsed.href;
        const coverUrl = new URL("/api/cover", baseOrigin);
        coverUrl.searchParams.set("src", parsed.href);
        coverUrl.searchParams.set("w", String(width));
        return coverUrl.href;
      },
      buildCoverImageSrcSet: (value, baseOrigin) => [320, 640, 960]
        .map((width) => {
          const coverUrl = new URL("/api/cover", baseOrigin);
          coverUrl.searchParams.set("src", new URL(value, baseOrigin).href);
          coverUrl.searchParams.set("w", String(width));
          return `${coverUrl.href} ${width}w`;
        })
        .join(", "),
    },
  },
  document: {
    referrer: "https://example.com/blog.html?page=2",
    querySelector(selector) {
      return selector === 'meta[name="application-name"]'
        ? { content: configuredSiteName }
        : null;
    },
  },
});
assert.equal(
  siteUtilsHarness.window.SiteUtils.buildPostPath("post 1"),
  "/post.html",
  "SiteUtils should reject invalid identifiers instead of generating ambiguous article routes",
);
const compactNotionPostId = "0123456789abcdef0123456789abcdef";
const hyphenatedNotionPostId = "01234567-89ab-cdef-0123-456789abcdef";
assert.equal(
  siteUtilsHarness.window.SiteUtils.arePostIdsEquivalent(compactNotionPostId, hyphenatedNotionPostId),
  true,
  "SiteUtils should treat compact and hyphenated forms of the same Notion UUID as one post",
);
assert.equal(
  siteUtilsHarness.window.SiteUtils.buildPostPath(hyphenatedNotionPostId.toUpperCase()),
  `/posts/${compactNotionPostId}`,
  "SiteUtils should generate one compact lowercase route for every valid Notion UUID spelling",
);
assert.equal(
  siteUtilsHarness.window.SiteUtils.getPostIdFromUrl(`https://example.com/posts/${hyphenatedNotionPostId}`),
  compactNotionPostId,
  "SiteUtils should normalize legacy hyphenated routes before client requests and cache lookup",
);
assert.equal(
  siteUtilsHarness.window.SiteUtils.getPostIdFromUrl(`https://example.com/posts/${compactNotionPostId}/extra`),
  null,
  "SiteUtils should not misclassify multi-segment paths as canonical post routes",
);
assert.equal(
  siteUtilsHarness.window.SiteUtils.getSiteName(),
  configuredSiteName,
  "SiteUtils should expose the injected site name to page modules",
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
const parsedDirtyBookmarkHash = siteUtilsHarness.window.SiteUtils.parseBookmarkListingHash(
  "#bookmarks?search=Alpha&page=2abc",
);
assert.equal(parsedDirtyBookmarkHash.page, 1, "SiteUtils should reject partially numeric bookmark page values");
assert.equal(
  parsedDirtyBookmarkHash.normalizedHash,
  "#bookmarks?search=Alpha",
  "SiteUtils should drop invalid bookmark page values from canonical hash routes",
);
const parsedPrefixedBookmarkHash = siteUtilsHarness.window.SiteUtils.parseBookmarkListingHash(
  "#bookmarks-old?search=Alpha&page=2",
);
assert.equal(
  parsedPrefixedBookmarkHash.active,
  false,
  "SiteUtils should not treat hashes that merely share the bookmark prefix as bookmark routes",
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
assert.equal(
  siteUtilsHarness.window.SiteUtils.resolveCoverImageUrl("https://assets.example.com/cover.png", { width: 320 }),
  "https://example.com/api/cover?src=https%3A%2F%2Fassets.example.com%2Fcover.png&w=320",
  "SiteUtils should expose the shared cover thumbnail resolver",
);
assert.ok(
  siteUtilsHarness.window.SiteUtils.buildCoverImageSrcSet("https://assets.example.com/cover.png").includes("960w"),
  "SiteUtils should expose responsive cover thumbnail srcsets",
);
const gradientWithCalcPlus = "linear-gradient(135deg, #abc 0%, #def calc(50% + 1px))";
assert.equal(
  serverCategoryNavigationHelpers.__test.normalizeCategoryGradient(gradientWithCalcPlus),
  gradientWithCalcPlus,
  "server gradient sanitizer should accept calc() expressions containing +",
);
assert.equal(
  siteUtilsHarness.window.SiteUtils.sanitizeCoverBackground(gradientWithCalcPlus),
  gradientWithCalcPlus,
  "client gradient sanitizer should accept calc() expressions containing +",
);
const siteUtilsFallbackHarness = loadBrowserScript("js/site-utils.js", {
  window: {
    location: new URL("https://example.com/blog.html"),
  },
  document: {
    referrer: "",
  },
});
const finePointerClassList = createClassList();
const finePointerSiteUtilsHarness = loadBrowserScript("js/site-utils.js", {
  window: {
    location: new URL("https://example.com/"),
    innerWidth: 320,
    navigator: { maxTouchPoints: 0 },
    ontouchstart: null,
    matchMedia: (query) => ({
      matches: query === "(pointer: fine)" || query === "(any-pointer: fine)",
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  },
  document: {
    referrer: "",
    documentElement: {
      clientWidth: 320,
      classList: finePointerClassList,
    },
  },
});
assert.equal(
  finePointerSiteUtilsHarness.window.SiteUtils.isMobileDeviceViewport(),
  false,
  "legacy ontouchstart exposure should not classify a fine-pointer 320px viewport as touch-first",
);
assert.equal(
  finePointerClassList.contains("is-mobile-device-viewport"),
  false,
  "fine-pointer narrow viewports should not receive touch-only compatibility effects",
);
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
const routerWarmFetches = [];
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
      getPageIdFromUrl(url) {
        const pathname = new URL(url, "https://example.com/").pathname;
        if (pathname === "/" || pathname === "/index.html") return "index";
        if (pathname === "/blog.html") return "blog";
        return null;
      },
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
  fetch: async (url, init) => {
    routerWarmFetches.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      text: async () => "<html></html>",
    };
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
assert.equal(
  routerHarness.window.SPARouter.warmPage("https://example.com.evil.invalid/blog.html"),
  false,
  "SPA warmup should reject an external origin that merely shares the site URL prefix",
);
assert.equal(
  routerHarness.window.SPARouter.warmPage("https://example.com/"),
  false,
  "SPA idle warmup should not request the active page",
);
assert.equal(routerWarmFetches.length, 0, "rejected SPA warmup candidates should not issue fetches");
assert.equal(
  routerHarness.window.SPARouter.warmPage("https://example.com/blog.html"),
  true,
  "SPA should warm a different same-origin cacheable page",
);
await Promise.resolve();
await Promise.resolve();
assert.equal(routerWarmFetches.length, 1, "accepted SPA warmup should issue one coalesced fetch");
assert.equal(routerWarmFetches[0].init?.cache, "default", "SPA prefetch should allow the browser HTTP cache instead of forcing no-store");
await runSpaRouterChecks({ assert, loadBrowserScript });

let bootstrapTimeoutCallback = null;
let bootstrapTimeoutCleared = false;
const bootstrapWatchdogHarness = loadBrowserScript("js/blog-bootstrap.js", {
  window: {
    location: new URL("https://example.com/blog.html"),
  },
  document: {
    body: { dataset: { page: "" } },
  },
  globals: {
    setTimeout(callback, delay) {
      assert.equal(delay, 35000, "blog bootstrap should outlive the complete 30 second server operation budget");
      bootstrapTimeoutCallback = callback;
      return 7;
    },
    clearTimeout(id) {
      if (id === 7) bootstrapTimeoutCleared = true;
    },
  },
  fetch: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => {
      const error = new Error("bootstrap fetch aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  }),
});
const watchedBootstrap = bootstrapWatchdogHarness.window.BlogBootstrap.ensure();
assert.equal(typeof bootstrapTimeoutCallback, "function", "blog bootstrap should arm its watchdog immediately");
bootstrapTimeoutCallback();
await assert.rejects(
  watchedBootstrap.promise,
  (error) => error?.status === 504 && error?.name !== "AbortError",
  "an unconsumed blog bootstrap deadline should surface as a stable 504",
);
assert.equal(watchedBootstrap.controller.signal.aborted, true, "blog bootstrap timeout should abort fetch");
assert.equal(bootstrapTimeoutCleared, true, "blog bootstrap should clear its watchdog after settling");

let externalBootstrapTimerCleared = false;
let externalBootstrapFetchCount = 0;
const externalBootstrapController = new AbortController();
const externalBootstrapHarness = loadBrowserScript("js/blog-bootstrap.js", {
  window: {
    location: new URL("https://example.com/blog.html"),
  },
  document: {
    body: { dataset: { page: "" } },
  },
  globals: {
    setTimeout() {
      return 8;
    },
    clearTimeout(id) {
      if (id === 8) externalBootstrapTimerCleared = true;
    },
  },
  fetch: async (_url, init) => {
    externalBootstrapFetchCount += 1;
    if (externalBootstrapFetchCount > 1) {
      return {
        ok: true,
        json: async () => ({ results: [], categories: [], total: 0, totalPages: 1, currentPage: 1 }),
      };
    }
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const error = new Error("caller aborted bootstrap");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  },
});
const externallyCancelledBootstrap = externalBootstrapHarness.window.BlogBootstrap.ensure(
  undefined,
  { signal: externalBootstrapController.signal },
);
externalBootstrapController.abort();
await assert.rejects(
  externallyCancelledBootstrap.promise,
  (error) => error?.name === "AbortError" && !error?.status,
  "external blog bootstrap cancellation should remain an AbortError",
);
assert.equal(
  externallyCancelledBootstrap.controller.signal.aborted,
  true,
  "external cancellation should propagate to the blog bootstrap fetch",
);
assert.equal(externalBootstrapTimerCleared, true, "external cancellation should clear the bootstrap watchdog");
const retriedBootstrap = externalBootstrapHarness.window.BlogBootstrap.ensure();
assert.notEqual(
  retriedBootstrap,
  externallyCancelledBootstrap,
  "a later navigation should not reuse an aborted bootstrap entry",
);
await retriedBootstrap.promise;
assert.equal(
  externalBootstrapFetchCount,
  2,
  "a later navigation should start a fresh bootstrap request after cancellation",
);

expectIncludes(runtimeCoreJs, 'application/ld+json', "runtime-core.js should own structured data script management");
expectNotIncludes(runtimeCoreJs, "readStructuredDataNonce", "runtime-core.js should treat JSON-LD as a CSP-inert data block");
expectNotIncludes(runtimeCoreJs, 'setAttribute("nonce"', "runtime-core.js should not add decorative nonces to JSON-LD data blocks");
expectIncludes(runtimeCoreJs, "syncStructuredDataFromDocument", "runtime-core.js should preserve fetched SSR JSON-LD during SPA swaps");
expectIncludes(runtimeCoreJs, "syncFromDocument", "runtime-core.js should expose structured-data document syncing");
expectIncludes(runtimeCoreJs, "document.head?.appendChild(script)", "runtime-core.js should append missing JSON-LD data-block scripts");
expectIncludes(runtimeCoreJs, "page-progress", "runtime-core.js should wire the shared page progress bar");
expectIncludes(runtimeCoreJs, "const NavigationFeedback = (() => {", "runtime-core.js should own accessible navigation failure feedback");
expectIncludes(runtimeCoreJs, 'root.setAttribute("role", "alert")', "navigation failure feedback should be announced immediately");
expectIncludes(runtimeCoreJs, "focusSpaContent", "runtime-core.js should expose SPA focus management");
expectIncludes(runtimeCoreJs, "cleanupTemporaryFocus", "runtime-core.js should clean up temporary SPA focus tabindex attributes");
expectIncludes(runtimeCoreJs, 'removeAttribute("tabindex")', "runtime-core.js should remove managed tabindex after programmatic focus");
expectIncludes(runtimeCoreJs, "const PageRuntime = (() => {", "runtime-core.js should own page module registration and cleanup");
expectIncludes(runtimeCoreJs, "function start(pageId = getPageIdFromUrl(window.location.href))", "runtime-core.js should split page registration from initial startup");
expectNotIncludes(runtimeCoreJs, "Page init error", "PageRuntime should propagate init failures instead of swallowing them");
expectNotIncludes(runtimeCoreJs, "if (pageId === getPageIdFromUrl(window.location.href))", "PageRuntime.register should not initialize pages during module import");
expectIncludes(appJs, "window.PageRuntime?.start?.();", "app.js should start the current page after all page modules register");
expectIncludes(bookmarkJs, "parseSerializedTags", "bookmark fallback should recover serialized tags");
expectIncludes(bookmarkJs, "window.CSS.escape(String(value))", "bookmark selector escaping should rely on the native CSS.escape implementation");
expectNotIncludes(bookmarkJs, "codeUnit.toString(16)", "bookmark selector escaping should not keep the deleted fallback implementation");
expectIncludes(bookmarkJs, "createBookmarkEntry", "bookmark manager should centralize bookmark record creation");
expectIncludes(bookmarkJs, "buildCardBookmarkSource", "bookmark manager should centralize DOM snapshot extraction");
expectIncludes(bookmarkJs, "hydrateMissingMetadata", "bookmark manager should hydrate stale metadata");
expectIncludes(bookmarkJs, "BOOKMARK_METADATA_HYDRATION_GENERATION = 6", "bookmark metadata should re-hydrate when the persistence generation bumps");
expectIncludes(bookmarkJs, "BOOKMARK_METADATA_FRESHNESS_MS = 1000 * 60 * 30", "bookmark cover signatures should have a bounded freshness window");
expectIncludes(bookmarkJs, "getDisplayEntries", "bookmark display reads should overlay current volatile cover metadata");
expectIncludes(blogPageJs, "bookmarkManager.getDisplayEntries", "bookmark views should consume rotation-safe display entries");
expectIncludes(bookmarkJs, "JSON.stringify(Array.isArray(entries) ? entries : [])", "bookmark snapshot keys should include normalized metadata, not only ids and timestamps");
assert.ok(
  !Array.from(bookmarkJs).some((character) => [0, 1].includes(character.codePointAt(0))),
  "bookmark.js should not contain raw control-character bytes",
);
expectIncludes(bookmarkJs, "same stale session summary", "bookmark freshness should document its coupling to the Notion summary TTL");
expectIncludes(bookmarkJs, "resolveDisplayImageUrl", "bookmark normalization should preserve displayable cover images");
expectIncludes(bookmarkJs, "coverPlaceholder?.dataset?.coverGradient", "bookmark DOM fallback should preserve card gradients");
expectIncludes(bookmarkJs, "coverPlaceholder?.dataset?.coverEmoji", "bookmark DOM fallback should preserve card emojis");
expectIncludes(bookmarkJs, "return false;", "bookmark save should fail explicitly when persistence is unavailable");
expectIncludes(bookmarkJs, "if (!save(bookmarks)) return null;", "bookmark toggles should abort when persistence fails");
expectIncludes(bookmarkJs, "if (!save(merged))", "bookmark hydration should fail cleanly when persistence is unavailable");
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
  notionContentHelpers.resolveProxiedDisplayImageUrl(
    "https://assets.example.com/cover.png?token=1",
    "https://example.com",
    { signature: "a".repeat(43) },
  ),
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
const responsiveCoverImageUrl = new URL(
  notionContentHelpers.resolveCoverImageUrl(
    "https://assets.example.com/cover.png?token=1",
    "https://example.com",
    { signature: "a".repeat(43), width: 960 },
  ),
);
assert.equal(
  responsiveCoverImageUrl.pathname,
  "/api/cover",
  "shared notion content helpers should send remote card covers through the cover thumbnail path",
);
assert.equal(
  responsiveCoverImageUrl.searchParams.get("w"),
  "960",
  "shared notion content helpers should preserve the requested responsive cover width",
);
assert.ok(
  notionContentHelpers.buildCoverImageSrcSet(
    "https://assets.example.com/cover.png",
    "https://example.com",
    { signature: "a".repeat(43) },
  ).includes("640w"),
  "shared notion content helpers should expose responsive card cover srcsets",
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
  "shared notion content module should prioritize the first article image without inventing an incorrect aspect ratio",
);
expectIncludes(
  renderedImagePriorityHtml,
  'src="https://example.com/second.png" alt="Second image" loading="lazy" decoding="async"',
  "shared notion content module should keep later article images lazy without inventing dimensions",
);
expectNotIncludes(
  renderedImagePriorityHtml,
  'width="1600" height="900"',
  "shared notion content module should not force unknown article images into a fake 16:9 intrinsic ratio",
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
      normalizeImageProxySignature: (value) => (typeof value === "string" ? value.trim() : ""),
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
  6,
  "bookmark manager should persist the upgraded metadata version for new bookmarks",
);
assert.ok(
  bookmarkManagerHarness.window.BookmarkManager.getAll()[0]?.metadataRefreshedAt > 0,
  "bookmark manager should timestamp new bookmark metadata freshness separately from user ordering",
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
const metadataSyncTimestamp = 1_700_000_000_000;
bookmarkStorageHandler?.({
  key: "bookmarked_posts",
  newValue: JSON.stringify([{
    id: "storage-bookmark",
    title: "Metadata before hydration",
    metadataVersion: 5,
    timestamp: metadataSyncTimestamp,
    tags: ["Cross tab"],
  }]),
});
await new Promise((resolve) => setTimeout(resolve, 130));
const eventsBeforeMetadataOnlyUpdate = bookmarkUpdatedEvents.length;
bookmarkStorageHandler?.({
  key: "bookmarked_posts",
  newValue: JSON.stringify([{
    id: "storage-bookmark",
    title: "Metadata after hydration",
    metadataVersion: 5,
    timestamp: metadataSyncTimestamp,
    tags: ["Cross tab"],
  }]),
});
await new Promise((resolve) => setTimeout(resolve, 130));
assert.equal(
  bookmarkUpdatedEvents.length,
  eventsBeforeMetadataOnlyUpdate + 1,
  "bookmark manager should broadcast cross-tab metadata updates even when ids and timestamps are unchanged",
);
assert.equal(
  bookmarkUpdatedEvents.at(-1)?.detail?.bookmarks?.[0]?.title,
  "Metadata after hydration",
  "cross-tab metadata update events should carry the refreshed bookmark fields",
);

await runBookmarkRotationChecks();
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
const structuredArticlePostId = "0123456789abcdef0123456789abcdef";
const serverArticleStructuredData = serverNotionHelpers.buildArticleStructuredData({
  id: structuredArticlePostId,
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
  serverArticleStructuredData.mainEntityOfPage.endsWith(`/posts/${structuredArticlePostId}`),
  "server notion structured data should point at the canonical post route",
);
assert.equal(
  serverArticleStructuredData.image[0],
  "https://example.com/cover.png",
  "server notion structured data should preserve stable article images",
);
const BOOKMARK_HASH_PREFIX_MOCK = "#bookmarks";

function normalizeBookmarkPageNumberMock(value, fallback = 1) {
  const normalizedFallback = Number.isSafeInteger(Number(fallback)) && Number(fallback) > 0
    ? Number(fallback)
    : 1;
  const rawValue = String(value ?? "").trim();
  if (!/^\d+$/.test(rawValue)) return normalizedFallback;
  const parsed = Number(rawValue);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : normalizedFallback;
}

function buildBookmarkListingUrlMock({ search = "", page = 1, pathname = "/blog.html" } = {}) {
  const params = new URLSearchParams();
  const normalizedSearch = typeof search === "string" ? search.trim() : "";
  const normalizedPage = normalizeBookmarkPageNumberMock(page, 1);
  if (normalizedSearch) params.set("search", normalizedSearch);
  if (normalizedPage > 1) params.set("page", String(normalizedPage));
  const query = params.toString();
  return `${pathname}${BOOKMARK_HASH_PREFIX_MOCK}${query ? `?${query}` : ""}`;
}

function isBookmarkListingHashMock(rawHash) {
  return rawHash === BOOKMARK_HASH_PREFIX_MOCK || rawHash.startsWith(`${BOOKMARK_HASH_PREFIX_MOCK}?`);
}

function parseBookmarkListingHashMock(hash = "") {
  const rawHash = typeof hash === "string" ? hash.trim() : "";
  if (!isBookmarkListingHashMock(rawHash)) {
    return { active: false, search: "", page: 1, normalizedHash: "" };
  }
  const params = new URLSearchParams(rawHash.slice(BOOKMARK_HASH_PREFIX_MOCK.length).replace(/^\?/, ""));
  const search = (params.get("search") || "").trim();
  const page = normalizeBookmarkPageNumberMock(params.get("page"), 1);
  const normalizedHash = buildBookmarkListingUrlMock({ pathname: "", search, page });
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
  notionContentSharedHelpers,
  notionContentUrlHelpers,
  notionContentUtilsHelpers,
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
  notionContentSharedHelpers,
  notionContentUrlHelpers,
  notionContentUtilsHelpers,
  siteUtilsHarness,
});
expectIncludes(notionApiJs, "createRequestError", "notion client should preserve HTTP status metadata on failures");
expectIncludes(notionApiJs, "error.status = Number(status);", "notion client should attach status codes to request errors");
expectIncludes(notionApiJs, 'postsEndpoint: "/api/posts-data"', "notion client should load post listings from the semantic endpoint");
expectIncludes(notionApiJs, 'postEndpoint: "/api/post-data"', "notion client should load post details from the restricted endpoint");
expectIncludes(notionApiJs, 'getArticleRenderer("renderPostArticle")', "notion client should resolve the shared article renderer only when article markup is requested");
expectIncludes(notionApiJs, "POST_SUMMARY_CACHE_TTL", "notion client should keep a separate summary cache for bookmarks");
expectIncludes(notionApiJs, "function createListingContentFacade()", "notion client should expose its lightweight listing dependencies explicitly");
expectIncludes(notionApiJs, "window.NotionContentShared", "notion client listing helpers should come from the lightweight shared constants module");
expectIncludes(notionApiJs, "window.NotionContentUtils", "notion client listing helpers should come from the lightweight utility module");
expectIncludes(notionApiJs, "window.NotionContentUrl", "notion client image helpers should come from the lightweight URL module");
expectIncludes(notionApiJs, "const articleContent = window.NotionContent;", "notion client should defer the full content module lookup until a render method is called");
expectNotIncludes(notionApiJs, "const sharedContent = window.NotionContent;", "notion client initialization should not require the full article renderer");
expectIncludes(notionApiJs, "const normalizedPageId = requirePublicPostId(pageId);", "notion client should canonicalize post ids before request deduplication");
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
expectIncludes(indexPageJs, ".trim().slice(0, PUBLIC_SEARCH_QUERY_MAX_LENGTH)", "index page should bound programmatic search URLs before SPA navigation");
expectIncludes(postPageJs, 'window.StructuredData?.set?.("post-article"', "post page should publish article structured data");
expectIncludes(postPageJs, "sharedContent.buildArticleStructuredData", "post page should reuse the shared article structured-data helper");
expectIncludes(postPageJs, "siteUtils.getSiteName", "post page metadata should read the configured site name");
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
expectIncludes(postPageJs, "element === navBookmark", "post page should hide the nav bookmark control while keeping the fab visible on mobile");
expectNotIncludes(postPageJs, "bindResponsiveBookmarkVisibility", "post page should not retain the legacy viewport listener now that bookmark visibility is viewport-independent");
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
  id: hyphenatedNotionPostId,
  title: "SSR fallback title",
  excerpt: "SSR fallback excerpt",
  category: "Tech",
  date: "2026-04-17",
  readTime: "5 min",
  coverImage: null,
  coverImageSignature: "a".repeat(43),
  coverEmoji: "馃摑",
  coverGradient: "linear-gradient(135deg, #111111, #222222)",
  tags: ["TypeScript"],
});
const fallbackWarnings = [];
loadBrowserScript("js/post-page.js", {
  window: {
    location: new URL(`https://example.com/posts/${compactNotionPostId}`),
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
        if (post?.id !== hyphenatedNotionPostId) return null;
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
      arePostIdsEquivalent: siteUtilsHarness.window.SiteUtils.arePostIdsEquivalent,
      getPostIdFromUrl: () => compactNotionPostId,
      normalizePostId: (value) => String(value || "").trim() || null,
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

const abortablePostPages = new Map();
const abortablePostSkeleton = new FakeElement();
const abortablePostContent = new FakeElement();
const abortablePostEmpty = new FakeElement();
const abortablePostArticle = new FakeElement();
const abortablePostFab = new FakeElement();
const abortablePostBack = new FakeElement();
const abortablePostStatus = new FakeElement();
abortablePostArticle.querySelector = (selector) => (
  selector === ".post-back" ? abortablePostBack : null
);
let postRequestSignal = null;
const postLoadErrors = [];
loadBrowserScript("js/post-page.js", {
  window: {
    location: new URL("https://example.com/posts/abortable-post"),
    NotionContent: {},
    NotionAPI: {
      getPost(postId, { signal } = {}) {
        assert.equal(postId, "abortable-post");
        postRequestSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const error = new Error("post request aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        });
      },
    },
    PageRuntime: {
      register(pageId, pageModule) {
        abortablePostPages.set(pageId, pageModule);
      },
    },
    SiteUtils: {
      getPostIdFromUrl: () => "abortable-post",
      normalizePostId: (value) => String(value || "").trim() || null,
      getPreferredBlogReturnUrl: () => "https://example.com/blog.html",
    },
  },
  document: {
    getElementById(id) {
      return {
        postSkeleton: abortablePostSkeleton,
        postContent: abortablePostContent,
        postEmpty: abortablePostEmpty,
        postArticle: abortablePostArticle,
        fabBookmark: abortablePostFab,
        postBack: abortablePostBack,
        postStatus: abortablePostStatus,
      }[id] || null;
    },
  },
  globals: {
    console: {
      ...console,
      error(...args) {
        postLoadErrors.push(args);
      },
    },
    HTMLScriptElement: FakeScriptElement,
  },
});
const abortablePostCleanup = abortablePostPages.get("post")?.init?.();
assert.equal(postRequestSignal?.aborted, false, "post page should pass a live AbortSignal to getPost");
abortablePostCleanup?.();
assert.equal(postRequestSignal?.aborted, true, "post page cleanup should abort its active detail request");
await Promise.resolve();
await Promise.resolve();
assert.equal(postLoadErrors.length, 0, "post page should silently ignore expected AbortError cancellation");

expectIncludes(apiPostJs, 'upsertStructuredDataScript(editor, "post-article"', "article HTML route should emit structured data through the shared template editor");
expectIncludes(apiPostJs, 'id="initialPostData"', "article HTML route should emit initial post data");
expectIncludes(apiPostJs, "buildUnavailableContent", "article HTML route should distinguish upstream failures from not-found routes");
expectIncludes(apiPostJs, "getSiteName", "article HTML route should read the configured site name");
expectIncludes(apiPostJs, "formatPostTitle", "article HTML route should compose post titles with the configured site name");
expectNotIncludes(apiPostJs, "Share Everything", "article HTML route should not hardcode the public site name");
expectIncludes(apiPostJs, "rejectUnsupportedReadMethod", "article HTML route should reuse the shared read-method guard");
expectIncludes(apiPostJs, "getPublicPostErrorStatus", "article HTML route should reuse shared public-post error mapping");
expectIncludes(apiPostJs, "fetchPublicPost", "article HTML route should only render posts from the public blog set");
expectIncludes(apiPostJs, "renderPostArticle(post, { renderedContent, baseOrigin })", "article HTML route should reuse the shared article-shell renderer for SSR");
expectIncludes(apiPostJs, 'findElementById(editor.doc, "postContent")', "article HTML route should tolerate harmless postContent template attribute changes");
expectIncludes(apiPostJs, "Falling back to article insertion", "article HTML route should fall back to article insertion when the postContent anchor changes");
expectIncludes(apiPostJs, '"Cache-Control", POST_HTML_CACHE_CONTROL', "article HTML success should use the bounded public-post edge cache policy");
expectIncludes(apiPostJs, 's-maxage=300, stale-while-revalidate=600', "article HTML cache lifetime should stay below transient Notion asset URL validity");
expectIncludes(apiPostJs, "templatePromise = null;", "article HTML route should clear a failed production template read before retrying");
expectIncludes(apiPostJs, "HEAD_META_BLOCK_START", "article HTML route should replace head metadata through explicit template anchors");
expectIncludes(apiPostJs, "parseTemplate(html)", "article HTML route should parse the SSR template before dynamic replacements");
expectIncludes(apiPostJs, "async function createTemplateEditor(html)", "article HTML route should centralize one parse5 document per SSR template edit batch");
expectIncludes(apiPostJs, "const editor = await createTemplateEditor(html);", "SSR success path should create one template editor before dynamic replacements");
expectIncludes(apiPostJs, "html = editor.apply();", "SSR success path should apply accumulated DOM patches once after dynamic replacements");
assert.equal(
  (apiPostJs.match(/await parseTemplate\(html\)/g) || []).length,
  1,
  "article HTML route should only parse each template editor source once",
);
expectIncludes(apiPostJs, "insertBeforeEndTag", "article HTML route should centralize DOM-node insertion and replacement");
expectNotIncludes(apiPostJs, "result !== html", "article HTML route should track replacement matches explicitly instead of comparing final strings");
expectIncludes(apiPostJs, "resolveShareImageUrl(post.coverImage, defaultShareImageUrl, siteOrigin)", "article HTML route should resolve og:image against the site origin consistently");
expectIncludes(apiPostJs, "../server/security-policy", "article HTML route should reuse the shared security policy builder");
expectIncludes(apiPostJs, "createCspNonce", "article HTML route should generate a per-request CSP nonce for the response header even though current templates only contain inert data blocks");
expectIncludes(apiPostJs, "applyHtmlSecurityHeaders(res, { scriptNonce })", "article HTML route should pass the generated nonce into the response header on the SSR success path");
expectIncludes(apiPostJs, "applyHtmlSecurityHeaders", "article HTML route should emit CSP headers from the SSR function");
expectNotIncludes(apiPostJs, "replaceContentSecurityPolicyMeta", "article HTML route should leave template CSP meta static while response headers carry CSP");
expectIncludes(postHtml, "<!--SSR_HEAD_META_START-->", "post template should mark the SSR-owned head metadata block explicitly");
expectIncludes(postHtml, "<!--SSR_HEAD_META_END-->", "post template should keep a closing marker for the SSR-owned head metadata block");
expectIncludes(postHtml, '<div id="postContent"', "post template should keep the postContent placeholder div for SSR replacement and client hydration");
expectIncludes(postHtml, 'id="postEmpty"', "post template should keep the postEmpty container for SSR fallback rendering");
expectIncludes(postHtml, "data-empty-link", "post empty-state should carry the data-empty-link anchor used by both SSR and client renderers");
expectNotIncludes(apiPostJs, "script-src-elem 'self' 'unsafe-inline'", "article HTML route should not allow arbitrary inline script elements");
expectNotIncludes(spaRouterJs, "rememberPageHtml(cacheKey, entry.html)", "SPA route cache reads should not refresh cachedAt into a sliding TTL");
expectIncludes(spaRouterJs, "pageCache.set(cacheKey, entry)", "SPA route cache reads should only refresh LRU order while preserving cachedAt");
expectIncludes(serverPostServiceJs, "const postSearchTextCache = new WeakMap()", "server search filtering should cache derived search text without mutating post objects");
expectNotIncludes(serverPostServiceJs, "Object.defineProperty(post, POST_SEARCH_TEXT_SYMBOL", "server search filtering should not attach derived search text to post inputs");

const replacementSentinel = "$& :: $` :: $'";
const escapedReplacementSentinel = "$&amp; :: $` :: $&#39;";
const nonceSentinel = "nonce-test-123";
const replacedPostContent = await apiPostHelpers.replacePostContent(
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
const injectedInitialPostData = await apiPostHelpers.injectInitialPostData("<main></main>", {
  title: replacementSentinel,
});
expectIncludes(injectedInitialPostData, replacementSentinel, "initial post data injection should preserve replacement tokens literally");
expectNotIncludes(injectedInitialPostData, "nonce=", "initial post data injection should not add decorative nonces to inert JSON data blocks");
const initialPostPayload = apiPostHelpers.buildInitialPostPayload({
  id: "post-1",
  title: "Payload title",
  excerpt: "Payload excerpt",
  category: "Tech",
  date: "2026-04-11",
  readTime: "5 min",
  coverImage: "https://example.com/cover.png",
  coverImageSignature: "b".repeat(43),
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
assert.equal(
  initialPostPayload.coverImageSignature,
  "b".repeat(43),
  "article HTML route should retain the server-issued cover signature in its hydration summary",
);

const structuredDataHtml = await apiPostHelpers.upsertStructuredDataScript("<head></head>", "post-article", {
  headline: replacementSentinel,
});
expectIncludes(structuredDataHtml, replacementSentinel, "structured data injection should preserve replacement tokens literally");
expectNotIncludes(structuredDataHtml, "nonce=", "structured data injection should not add decorative nonces to JSON-LD data blocks");
const nonceContentSecurityPolicy = securityPolicyHelpers.buildContentSecurityPolicy({
  scriptNonce: nonceSentinel,
});
expectIncludes(
  nonceContentSecurityPolicy,
  `script-src 'self' 'nonce-${nonceSentinel}'`,
  "security policy helper should still support nonces for future executable inline scripts",
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
const nonceHeaderFallbackRes = createApiResponseRecorder();
await apiPostHandler({ method: "GET", query: {} }, nonceHeaderFallbackRes);
expectIncludes(
  nonceHeaderFallbackRes.getHeader("content-security-policy"),
  "script-src 'self'",
  "article HTML route should send CSP through the HTTP response header",
);
expectIncludes(
  nonceHeaderFallbackRes.textBody,
  '<meta http-equiv="Content-Security-Policy"',
  "article HTML route should keep the static template CSP meta tag in the body",
);
assert.equal(
  (nonceHeaderFallbackRes.textBody.match(/http-equiv="Content-Security-Policy"/g) || []).length,
  1,
  "article HTML route should preserve exactly one static CSP meta tag",
);
expectNotIncludes(
  nonceHeaderFallbackRes.textBody.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/)?.[0] || "",
  "nonce-",
  "article HTML route should not mirror response nonces into the CSP meta tag",
);
expectIncludes(
  apiPostJs,
  "const scriptNonce = createCspNonce();",
  "SSR success path source should generate a per-request CSP nonce",
);
expectIncludes(
  apiPostJs,
  "applyHtmlSecurityHeaders(res, { scriptNonce })",
  "SSR success path source should pass the generated nonce into the response header",
);

const replacedHeadMeta = await apiPostHelpers.replaceHeadMeta(`<!doctype html><html><head>
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
  await apiPostHelpers.replaceHeadMeta(`<!doctype html><html><head>
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

const replacedEmptyState = await apiPostHelpers.replaceEmptyStateContent(
  '<div class="empty-state" id="postEmpty"><svg></svg><p>old</p><p class="empty-state-helper"><a class="empty-state-link" data-empty-link href="/old">old</a></p></div>',
  {
    message: replacementSentinel,
    linkText: replacementSentinel,
  },
);
const replacedEmptyStateReversedOrder = await apiPostHelpers.replaceEmptyStateContent(
  '<div class="empty-state" id="postEmpty"><svg></svg><p>old</p><p class="empty-state-helper"><a class="empty-state-link" href="/old" data-empty-link>old</a></p></div>',
  { message: "ignored", linkText: replacementSentinel },
);
assert.ok(
  replacedEmptyStateReversedOrder.includes(escapedReplacementSentinel)
    && replacedEmptyStateReversedOrder.includes('href="/blog.html"'),
  "empty-state replacement must tolerate href/data-empty-link in either attribute order",
);
assert.ok(
  !replacedEmptyStateReversedOrder.includes('href="/old"'),
  "empty-state replacement must rewrite the original href even when it precedes data-empty-link",
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
const invalidPostRouteRes = createApiResponseRecorder();
await apiPostHandler({ method: "GET", query: { id: "unsafe/post?debug=1" } }, invalidPostRouteRes);
assert.equal(invalidPostRouteRes.statusCode, 404, "article HTML route should reject invalid public post ids before upstream rendering");
assert.equal(invalidPostRouteRes.getHeader("cache-control"), "no-store", "article HTML route should keep invalid post ids non-cacheable");
const nonCanonicalPostRouteRes = createApiResponseRecorder();
await apiPostHandler({
  method: "GET",
  query: { id: "550E8400-E29B-41D4-A716-446655440000", tracking: "1" },
}, nonCanonicalPostRouteRes);
assert.equal(nonCanonicalPostRouteRes.statusCode, 308, "article HTML route should permanently redirect valid non-canonical ids");
assert.equal(
  nonCanonicalPostRouteRes.getHeader("location"),
  "/posts/550e8400e29b41d4a716446655440000",
  "article HTML redirects should collapse case, hyphens, and extra query keys to one route",
);
assert.equal(
  nonCanonicalPostRouteRes.getHeader("cache-control"),
  "public, max-age=86400, s-maxage=604800",
  "canonical article redirects should be safely edge-cacheable",
);
const rawVariantPostRouteRes = createApiResponseRecorder();
await apiPostHandler({
  method: "GET",
  url: "/api/post?id=550e8400e29b41d4a716446655440000&",
  query: { id: "550e8400e29b41d4a716446655440000" },
}, rawVariantPostRouteRes);
assert.equal(rawVariantPostRouteRes.statusCode, 308, "article HTML route should reject raw query-string cache-key variants");
assert.equal(
  rawVariantPostRouteRes.getHeader("location"),
  "/posts/550e8400e29b41d4a716446655440000",
  "raw article query variants should redirect to the unique public route",
);
const legacyPostRouteRes = createApiResponseRecorder();
await apiPostHandler({
  method: "GET",
  url: "/post.html?id=550e8400e29b41d4a716446655440000",
  query: { id: "550e8400e29b41d4a716446655440000" },
}, legacyPostRouteRes);
assert.equal(legacyPostRouteRes.statusCode, 308, "legacy post.html detail URLs should redirect to the canonical article route");
for (const url of [
  "/posts/550e8400e29b41d4a716446655440000?",
  "/posts/550e8400e29b41d4a716446655440000#fragment",
]) {
  const noisyCanonicalPathRes = createApiResponseRecorder();
  await apiPostHandler({
    method: "GET",
    url,
    query: { id: "550e8400e29b41d4a716446655440000" },
  }, noisyCanonicalPathRes);
  assert.equal(noisyCanonicalPathRes.statusCode, 308, `article route should reject raw path noise: ${url}`);
}
const duplicatePostRouteRes = createApiResponseRecorder();
await apiPostHandler({
  method: "GET",
  query: { id: ["550e8400e29b41d4a716446655440000", "550e8400e29b41d4a716446655440000"] },
}, duplicatePostRouteRes);
assert.equal(duplicatePostRouteRes.statusCode, 404, "article HTML route should reject duplicate id query values");
assert.equal(duplicatePostRouteRes.getHeader("cache-control"), "no-store", "duplicate article ids should not be cached");
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
expectIncludes(apiPostDataJs, "readPublicPostId", "post data endpoint should validate route ids before loading public post details");
expectIncludes(apiPostDataJs, '"Cache-Control", POST_DATA_CACHE_CONTROL', "post data success should use the bounded public-post edge cache policy");
expectIncludes(apiPostDataJs, 's-maxage=300, stale-while-revalidate=600', "post data cache lifetime should stay below transient Notion asset URL validity");
expectIncludes(apiPostJs, "readPublicPostId", "article HTML route should validate route ids before rendering public post details");
expectIncludes(publicContentJs, "rejectUnsupportedReadMethod", "public content helper should centralize read-only method guards");
expectIncludes(publicContentJs, "function readPublicPostId", "public content helper should centralize public post id validation");
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
  apiCoverHandler,
  apiCoverJs,
  apiImageHandler,
  apiImageJs,
  createApiResponseRecorder,
  createImageRequestMock,
  expectIncludes,
  expectNotIncludes,
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
  loadCommonJsModule,
  vercelJson,
});
await runLocalServerIntegrationChecks({ assert });
console.log("Smoke check passed.");
