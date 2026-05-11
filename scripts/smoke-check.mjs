import { notionBlockFixtures } from "./fixtures/notion-block-fixtures.mjs";
import { runBlogPageChecks } from "./smoke-check/blog-page.mjs";
import { runImageProxyChecks } from "./smoke-check/image-proxy.mjs";
import { runNotionApiClientChecks } from "./smoke-check/notion-api-client.mjs";
import { runPublicContentAndNotionChecks } from "./smoke-check/public-content-notion.mjs";
import { runRoutingAndVercelChecks } from "./smoke-check/routing-vercel.mjs";
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
  "js/index-page.js",
  "js/notion-content.js",
  "js/notion-api.js",
  "js/post-page.js",
  "js/runtime-core.js",
  "js/seo-meta.js",
  "js/site-utils.js",
  "js/spa-router.js",
  "js/ui-effects.js",
  "api/notion.js",
  "api/image.js",
  "api/posts-data.js",
  "api/post-data.js",
  "api/post.js",
  "api/sitemap.js",
  "server/public-content.js",
  "server/security-policy.js",
  "server/notion-server.js",
].forEach(checkSyntax);
const indexHtml = read("index.html");
const blogHtml = read("blog.html");
const postHtml = read("post.html");
const gitAttributes = read(".gitattributes");
const kiroGitRules = read(".kiro/steering/git-rules.md");
const packageJson = read("package.json");
const readmeMd = read("README.md");
const siteArchitectureMd = read("SITE_ARCHITECTURE.md");
const vercelJson = read("vercel.json");
const envExample = read(".env.example");
const licenseText = read("LICENSE");
const localServerJs = read("scripts/local-server.mjs");
const styleCss = read("css/style.css");
const blogPageCss = read("css/blog-page.css");
const postPageCss = read("css/post-page.css");
const commonJs = read("js/common.js");
const blogPageJs = read("js/blog-page.js");
const runtimeCoreJs = read("js/runtime-core.js");
const spaRouterJs = read("js/spa-router.js");
const bookmarkJs = read("js/bookmark.js");
const indexPageJs = read("js/index-page.js");
const notionContentJs = read("js/notion-content.js");
const notionApiJs = read("js/notion-api.js");
const postPageJs = read("js/post-page.js");
const siteUtilsJs = read("js/site-utils.js");
const smokeCheckSource = read("scripts/smoke-check.mjs");
const smokeCheckModuleSources = [
  read("scripts/smoke-check/blog-page.mjs"),
  read("scripts/smoke-check/harness.mjs"),
  read("scripts/smoke-check/image-proxy.mjs"),
  read("scripts/smoke-check/notion-api-client.mjs"),
  read("scripts/smoke-check/public-content-notion.mjs"),
  read("scripts/smoke-check/routing-vercel.mjs"),
];
const apiNotionJs = read("api/notion.js");
const apiImageJs = read("api/image.js");
const apiPostsDataJs = read("api/posts-data.js");
const apiPostDataJs = read("api/post-data.js");
const apiPostJs = read("api/post.js");
const apiSitemapJs = read("api/sitemap.js");
const publicContentJs = read("server/public-content.js");
const serverNotionJs = read("server/notion-server.js");
const notionContentHelpers = loadCommonJsModule("js/notion-content.js");
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
  "buildContentSchema",
  "buildCategoryFilter",
  "buildDatabaseSorts",
  "buildPublicAccessPolicyFromDatabase",
  "filterPostsBySearch",
  "normalizePostQueryFilters",
  "renderPostContent",
]);

expectIncludes(indexHtml, 'property="og:image"', "index.html should declare og:image");
expectIncludes(blogHtml, 'property="og:image"', "blog.html should declare og:image");
expectIncludes(postHtml, 'property="og:image"', "post.html should declare og:image");
expectIncludes(indexHtml, 'id="heroSearchForm"', "index.html should expose a real search form");
expectIncludes(indexHtml, 'action="/blog.html"', "index.html search should degrade to a real blog route");
expectIncludes(indexHtml, 'method="get"', "index.html search should work without JavaScript");
expectIncludes(postHtml, 'rel="canonical"', "post.html should declare a fallback canonical link");
expectIncludes(postHtml, 'href="/blog.html"', "post.html should use root-relative blog links for canonical post routes");
expectIncludes(postHtml, 'src="/js/post-page.js"', "post.html should use root-relative scripts for canonical post routes");
expectIncludes(postHtml, 'id="postStatus"', "post.html should expose a live status region for post interactions");
expectIncludes(blogHtml, 'href="/"', "blog.html should point the home action to the canonical root route");
expectIncludes(postHtml, 'href="/"', "post.html should point the home action to the canonical root route");
expectIncludes(indexHtml, 'href="/blog.html#bookmarks"', "index.html should keep bookmark navigation on a hash-only route");
expectIncludes(indexHtml, 'id="ctaHome" href="/blog.html" aria-label="总览"', "index hero overview CTA should expose an accessible name");
expectIncludes(indexHtml, 'id="ctaStart" href="/blog.html?category=%E7%B2%BE%E9%80%89" aria-label="精选"', "index hero featured CTA should expose an accessible name");
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
const sharedRuntimeScriptSources = [
  "/js/font-loader.js",
  "/js/notion-content.js",
  "/js/runtime-core.js",
  "/js/site-utils.js",
  "/js/common.js",
  "/js/ui-effects.js",
  "/js/seo-meta.js",
  "/js/spa-router.js",
];
const expectedStaticContentSecurityPolicy = securityPolicyHelpers.buildStaticContentSecurityPolicy();
pageHtmlByLabel.forEach(([label, htmlSource]) => {
  assert.equal(
    extractContentSecurityPolicyMetaContent(htmlSource),
    expectedStaticContentSecurityPolicy,
    `${label} static CSP meta should match the shared security policy builder`,
  );

  sharedRuntimeScriptSources.forEach((src) => {
    expectIncludes(
      htmlSource,
      `src="${src}" data-spa-runtime`,
      `${label} should mark ${src} as a shared SPA runtime script`,
    );
  });
});
expectNoMalformedClosingTags(indexHtml, "index.html should not contain malformed closing tags");
expectNoMalformedClosingTags(blogHtml, "blog.html should not contain malformed closing tags");
expectNoMalformedClosingTags(postHtml, "post.html should not contain malformed closing tags");
expectIncludes(indexHtml, "data-page-focus", "index.html should mark a focus target");
expectIncludes(blogHtml, "data-page-focus", "blog.html should mark a focus target");
expectIncludes(blogHtml, 'id="blogStatus"', "blog.html should include the live status region");
expectIncludes(blogHtml, 'id="blogGrid" role="list"', "blog grid should expose list semantics");
expectIncludes(blogHtml, 'href="/css/blog-page.css"', "blog.html should load blog-page.css");
expectIncludes(postHtml, 'href="/css/post-page.css"', "post.html should load post-page.css");
expectIncludes(gitAttributes, "*.mjs text eol=lf", ".gitattributes should normalize .mjs files to LF");
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
expectIncludes(blogPageJs, "blog-card-cover-fallback", "blog cards should show a stable fallback while remote covers load");
expectIncludes(blogPageCss, ".blog-card-cover-fallback", "blog card cover CSS should keep fallback art visible until the image paints");
expectIncludes(blogPageCss, "z-index: 2;\n  border-radius: inherit;", "blog card link layer should stay above cover media");
expectIncludes(blogPageCss, "pointer-events: none;\n}", "blog card cover media should not swallow clicks meant for the card link");
expectIncludes(blogPageCss, "z-index: 3;\n  display: inline-flex;", "blog card bookmark button should stay above the card link layer");
expectIncludes(commonJs, "DESKTOP_PARTICLE_COUNT = 350", "particle runtime should preserve the desktop particle density");
expectIncludes(commonJs, "MOBILE_PARTICLE_COUNT = 72", "particle runtime should use the lighter v3.2 mobile-only particle density");
expectIncludes(commonJs, "MOBILE_PARTICLE_FRAME_INTERVAL_MS = 50", "particle runtime should throttle mobile-only particle drawing");
expectIncludes(commonJs, "class MobileParticle", "particle runtime should use a cheaper mobile-only particle model");
expectIncludes(commonJs, "particleProfile.isMobile ? MobileParticle : Particle", "particle runtime should keep the desktop particle class separate from the mobile renderer");
expectIncludes(commonJs, "siteUtils.isMobileDeviceViewport", "particle runtime should use the shared real-mobile gate before changing density");
expectIncludes(commonJs, '(hover: none) and (pointer: coarse)', "particle fallback should avoid treating narrow desktop windows as mobile");
expectNotIncludes(commonJs, "function shouldReduceMotion", "particle runtime should not stop the old particle animation for reduced-motion settings");
expectNotIncludes(commonJs, "shouldReduceMobileParticles", "particle runtime should avoid reduced-motion gates in the particle loop");
expectIncludes(commonJs, "if (particlesPausedForScroll)", "particle runtime should only stop animation for the explicit mobile scroll pause");
expectIncludes(commonJs, "pauseMobileParticlesDuringScroll", "particle runtime should pause mobile particles while scrolling");
expectIncludes(commonJs, "if (!isMobileParticleViewport()) return;", "particle runtime should keep scroll pauses mobile-only");
expectIncludes(siteUtilsJs, 'MOBILE_DEVICE_QUERY = "(max-width: 768px) and (hover: none) and (pointer: coarse)"', "site utils should centralize the real-mobile device query");
expectIncludes(siteUtilsJs, "createMobileDeviceQueryList", "site utils should expose a reusable mobile media query helper");
expectIncludes(styleCss, "@media (max-width: 768px) and (hover: none) and (pointer: coarse)", "shared mobile CSS should not affect narrow desktop windows");
expectIncludes(blogPageCss, "@media (max-width: 768px) and (hover: none) and (pointer: coarse)", "blog mobile CSS should not affect narrow desktop windows");
expectIncludes(postPageCss, "@media (max-width: 768px) and (hover: none) and (pointer: coarse)", "post mobile CSS should not affect narrow desktop windows");
expectIncludes(styleCss, 'body[data-page="post"] .action-btn span', "post mobile dock should constrain labels so the bar stays fully visible");
expectIncludes(styleCss, "max(12px, env(safe-area-inset-left))", "post mobile dock should respect horizontal safe areas on narrow phones");
expectIncludes(styleCss, "@media (max-width: 360px) and (hover: none) and (pointer: coarse)", "post mobile dock should have an icon-only fallback for very narrow phones");
expectIncludes(styleCss, "@media (hover: none) and (pointer: coarse)", "cursor glow should be disabled only for touch-first pointers");
expectNotIncludes(styleCss, "@media (hover: none), (pointer: coarse)", "cursor glow touch fallback should not use a broad OR media query");
assert.ok(
  !/@media\s*\(max-width:\s*(?:768|540|360)px\)\s*\{/.test(`${styleCss}\n${blogPageCss}\n${postPageCss}`),
  "mobile CSS breakpoints should include the real-mobile pointer/hover gate",
);
expectNotIncludes(postPageJs, 'createMediaQueryList("(max-width: 768px)")', "post page should not treat narrow desktop windows as mobile");
expectIncludes(blogPageCss, "opacity 0.3s ease", "blog cards should use shorter reveal transitions on mobile");
expectIncludes(blogPageJs, 'window.scrollTo({ top: 0, behavior: "auto" });', "blog pagination should avoid smooth-scroll jank on mobile");
expectIncludes(notionApiJs, "POSTS_RESPONSE_CACHE_TTL", "notion client should keep a short in-memory list cache for fast returns");
expectIncludes(notionApiJs, "POST_SUMMARY_MEMORY_CACHE_LIMIT = 200", "notion client should bound browser-side post summary memory");
expectIncludes(notionApiJs, "rememberPostSummaryInMemory", "notion client should centralize post summary memory LRU updates");
expectIncludes(notionApiJs, "postSummaryMemoryCache.keys().next().value", "notion client should evict the oldest in-memory post summary");
expectIncludes(notionContentJs, "IMAGE_PROXY_PATH", "shared notion content should proxy remote display images through the same-origin image endpoint");
expectIncludes(apiImageJs, "IMAGE_PROXY_CACHE_CONTROL", "image proxy endpoint should cache successful image responses at the edge");
expectIncludes(apiImageJs, 'readPositiveEnvNumber("IMAGE_PROXY_TIMEOUT_MS", 10_000)', "image proxy timeout should be configurable while keeping its default");
expectIncludes(apiImageJs, 'readPositiveEnvNumber("IMAGE_PROXY_MAX_BYTES", 8 * 1024 * 1024)', "image proxy size limit should be configurable while keeping its default");
expectIncludes(apiImageJs, 'readNonNegativeEnvInteger("IMAGE_PROXY_MAX_REDIRECTS", 4)', "image proxy redirect limit should be configurable while keeping its default");
expectIncludes(packageJson, '"dev": "node scripts/local-server.mjs"', "package scripts should expose the local API-aware dev server");
expectIncludes(packageJson, '"license": "MIT"', "package metadata should match the published README license");
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
expectIncludes(siteArchitectureMd, "`notion-content.js` renders Notion blocks through a `block.type` -> renderer registry", "architecture docs should describe the block renderer registry");
expectIncludes(siteArchitectureMd, "`scripts/smoke-check.mjs` is the single `npm.cmd run check` entrypoint", "architecture docs should describe the smoke-check entrypoint");
expectIncludes(siteArchitectureMd, "`image-proxy.mjs` for `/api/image`", "architecture docs should list focused smoke-check modules");
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
expectIncludes(localServerJs, '["/api/image", require("../api/image.js")]', "local dev server should route the image proxy endpoint");
expectIncludes(localServerJs, '[".webp", "image/webp"]', "local dev server should serve WebP images with the correct MIME type");
expectIncludes(localServerJs, '[".jpg", "image/jpeg"]', "local dev server should serve JPEG images with the correct MIME type");
expectIncludes(localServerJs, '[".jpeg", "image/jpeg"]', "local dev server should serve JPEG images with the correct MIME type");
expectIncludes(localServerJs, '[".ico", "image/x-icon"]', "local dev server should serve icons with the correct MIME type");
expectIncludes(localServerJs, '[".xml", "application/xml; charset=utf-8"]', "local dev server should serve XML with the correct MIME type");
expectIncludes(localServerJs, '[".mjs", "application/javascript; charset=utf-8"]', "local dev server should serve ESM scripts with the correct MIME type");
expectIncludes(localServerJs, "path.relative(rootDir, filePath)", "local dev server should validate static paths by relative containment");
expectIncludes(localServerJs, "path.isAbsolute(relativePath)", "local dev server should reject absolute relative paths after static path resolution");
expectIncludes(spaRouterJs, 'script[src]:not([data-spa-runtime])', "SPA router should skip shared runtime scripts via HTML metadata");
expectIncludes(spaRouterJs, "waitForRouteExitCue", "SPA router should preserve the v1.6-style route exit cue");
expectIncludes(spaRouterJs, "ROUTE_EXIT_CUE_MS = 150", "SPA router should keep the old quick route exit pause");
expectIncludes(spaRouterJs, "ROUTE_LOCAL_POST_FALLBACK_MS", "SPA router should quickly recover local post route stalls");
expectIncludes(spaRouterJs, "ROUTE_STUCK_FALLBACK_MS", "SPA router should recover if a route transition gets stuck in the exit state");
expectIncludes(spaRouterJs, "getNavigationFallbackUrl", "SPA router stuck fallback should use local-compatible post URLs");
expectIncludes(spaRouterJs, "pendingPageFetches", "SPA router should coalesce in-flight page HTML prefetch and navigation requests");
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
    location: new URL("https://example.com/blog.html"),
    SiteUtils: {
      resolveShareImageUrl: (candidate, fallback) => candidate || fallback,
    },
  },
  document: seoDocument,
});
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
expectIncludes(runtimeCoreJs, "readStructuredDataNonce", "runtime-core.js should only create JSON-LD nodes when a request nonce is available");
expectIncludes(runtimeCoreJs, "document.head?.querySelector", "runtime-core.js should only trust nonce-bearing scripts already present in the active document head");
expectIncludes(runtimeCoreJs, 'script.setAttribute("nonce", nonce)', "runtime-core.js should preserve CSP nonce protection for runtime JSON-LD updates");
expectIncludes(runtimeCoreJs, "page-progress", "runtime-core.js should wire the shared page progress bar");
expectIncludes(runtimeCoreJs, "focusSpaContent", "runtime-core.js should expose SPA focus management");
expectIncludes(runtimeCoreJs, "const PageRuntime = (() => {", "runtime-core.js should own page module registration and cleanup");
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
expectIncludes(notionContentJs, "root.NotionContent", "shared notion content module should publish a browser global");
expectIncludes(notionContentJs, "module.exports = exported;", "shared notion content module should support CommonJS consumers");
expectIncludes(notionContentJs, "function mapNotionPage", "shared notion content module should own notion page mapping");
expectIncludes(notionContentJs, "function renderBlocks", "shared notion content module should own block rendering");
expectIncludes(notionContentJs, "function createBlockRenderers", "shared notion content module should register block renderers by type");
expectIncludes(notionContentJs, "const blockRenderers = createBlockRenderers()", "shared notion content module should keep renderer dispatch in a registry");
expectNotIncludes(notionContentJs, "switch (block.type)", "shared notion content renderer should avoid a central block-type switch");
expectIncludes(notionContentJs, "function renderPostArticle", "shared notion content module should own article-shell rendering for both SSR and CSR");
expectIncludes(notionContentJs, "function renderMathExpression", "shared notion content module should render Notion equations without exposing LaTeX as code");
expectIncludes(notionContentJs, "application/x-tex", "shared notion content module should keep the original TeX only as MathML annotation");
expectIncludes(notionContentJs, "resolveDisplayImageUrl", "shared notion content module should expose a display-safe image resolver");
expectIncludes(notionContentJs, 'const SAFE_IMAGE_PROTOCOLS = new Set(["https:"])', "shared notion content module should align external image URL policy with production CSP");
expectIncludes(notionContentJs, "resolveNotionContentSchema", "shared notion content module should resolve Notion schemas for renamed database properties");
expectIncludes(notionContentJs, "REMOTE_BLOG_CATEGORIES", "shared notion content module should centralize remote blog category definitions");
expectIncludes(notionContentJs, "BOOKMARK_ONLY_CATEGORIES", "shared notion content module should centralize bookmark-only category definitions");
expectIncludes(notionContentJs, "table: () => ({", "shared notion content module should preserve Notion table blocks");
expectIncludes(notionContentJs, "buildResourceBlock(", "shared notion content module should preserve file-like Notion blocks");
expectIncludes(notionContentJs, "buildUnsupportedBlock(", "shared notion content module should surface unsupported blocks instead of dropping them");
expectIncludes(notionContentJs, "table_of_contents: () => ({ type })", "shared notion content module should preserve table of contents blocks for semantic rendering");
expectIncludes(notionContentJs, "function renderTableOfContentsBlock", "shared notion content module should build semantic table of contents navigation");
expectIncludes(notionContentJs, "function renderBookmarkBlock", "shared notion content module should render bookmark blocks as semantic cards");
expectIncludes(notionContentJs, "function renderEmbedBlock", "shared notion content module should render embed resources through a dedicated renderer");
expectIncludes(postPageCss, ".post-math-display", "post page CSS should style display equations as rendered math instead of code");
expectNotIncludes(postPageCss, ".post-equation-expression code", "post page CSS should not style equations as visible code blocks");
assert.equal(
  notionContentHelpers.ALL_CATEGORY,
  "全部",
  "shared notion content module should expose the canonical all-posts category label",
);
assert.equal(
  notionContentHelpers.BOOKMARK_CATEGORY,
  "收藏",
  "shared notion content module should expose the canonical bookmark category label",
);
assert.ok(
  notionContentHelpers.getRemoteBlogCategories().some(
    (category) => category.name && category.name !== notionContentHelpers.ALL_CATEGORY,
  ),
  "shared notion content module should publish the remote category list for client pages",
);
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
const bookmarkManagerHarness = loadBrowserScript("js/bookmark.js", {
  window: {
    CSS: {
      escape: (value) => String(value),
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
  defaultShareImageUrl: "https://example.com/favicon.png?v=2",
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
expectIncludes(postPageJs, 'element.style.display = mobileNavQuery.matches ? "none" : "flex";', "post page should hide the floating bookmark control on mobile through JavaScript state");
expectIncludes(postPageJs, "createMobileDeviceQueryList", "post page should use the shared real-mobile query for bookmark control placement");
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
    BookmarkManager: {
      isBookmarked: () => false,
      toggle(post) {
        fallbackBookmarkToggleCount += 1;
        return post?.id === "post-1";
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
fabBookmarkEl.dispatch("click");
assert.equal(
  fallbackBookmarkToggleCount,
  1,
  "post page should still wire bookmark interactions from SSR initial data when the client API is unavailable",
);
postPageCleanup?.();
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
expectIncludes(apiPostJs, "replaceMarkup(", "article HTML route should use literal-safe SSR replacements for dynamic content");
expectIncludes(apiPostJs, "upsertHeadMarkup", "article HTML route should centralize head-tag insertion and replacement");
expectNotIncludes(apiPostJs, "result !== html", "article HTML route should track replacement matches explicitly instead of comparing final strings");
expectIncludes(apiPostJs, "resolveShareImageUrl(post.coverImage, defaultShareImageUrl, siteOrigin)", "article HTML route should resolve og:image against the site origin consistently");
expectIncludes(apiPostJs, "../server/security-policy", "article HTML route should reuse the shared security policy builder");
expectIncludes(apiPostJs, "createCspNonce", "article HTML route should use per-request nonces for inline JSON data");
expectIncludes(apiPostJs, "applyHtmlSecurityHeaders", "article HTML route should emit nonce-aware CSP headers from the SSR function");
expectIncludes(apiPostJs, "replaceContentSecurityPolicyMeta", "article HTML route should keep template CSP meta in sync with the response nonce");
expectNotIncludes(apiPostJs, "script-src-elem 'self' 'unsafe-inline'", "article HTML route should not allow arbitrary inline script elements");

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
const dedupedCspMeta = apiPostHelpers.replaceContentSecurityPolicyMeta(
  "<head><meta http-equiv=Content-Security-Policy content=old><meta content=\"legacy\" http-equiv=\"Content-Security-Policy\"></head>",
  { scriptNonce: nonceSentinel },
);
assert.equal(
  (dedupedCspMeta.match(/http-equiv="Content-Security-Policy"/g) || []).length,
  1,
  "article HTML route should collapse duplicate CSP meta tags to avoid intersecting policies",
);
expectNotIncludes(dedupedCspMeta, "content=old", "article HTML route should remove duplicate unquoted CSP meta policies");
expectNotIncludes(dedupedCspMeta, 'content="legacy"', "article HTML route should remove duplicate quoted CSP meta policies");

const replacedHeadMeta = apiPostHelpers.replaceHeadMeta(`<!doctype html><html><head>
<title>Old</title>
<meta name="description" content="old" />
<meta property="og:title" content="old" />
<meta property="og:description" content="old" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://example.com/old" />
<meta property="og:image" content="https://example.com/old.png" />
<meta property="og:image:alt" content="old" />
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
<meta property="og:image" content="https://example.com/favicon.png?v=2" />
<meta property="og:image:alt" content="Share Everything" />
<link rel="canonical" href="https://example.com/post.html" />
</head></html>`, {
    title: "Same title",
    description: "Same description",
    url: "https://example.com/post.html",
    image: "https://example.com/favicon.png?v=2",
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
  '<div class="empty-state" id="postEmpty"><svg></svg><p>old</p><p style="font-size: 0.85rem;"><a href="/old">old</a></p></div>',
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
assert.equal(postRouteMethodNotAllowedRes.getHeader("allow"), "GET", "article HTML route should advertise the supported methods on 405 responses");
assert.equal(postRouteMethodNotAllowedRes.getHeader("cache-control"), "no-store", "article HTML route should mark 405 responses as non-cacheable");
const postRouteHeadRes = createApiResponseRecorder();
await apiPostHandler({ method: "HEAD", query: { id: "post-1" } }, postRouteHeadRes);
assert.equal(postRouteHeadRes.statusCode, 405, "article HTML route should reject HEAD without loading Notion content");
assert.equal(postRouteHeadRes.getHeader("allow"), "GET", "article HTML route should avoid advertising HEAD when it is intentionally unsupported");
expectIncludes(apiPostsDataJs, "queryPublicPosts", "post list endpoint should serve the public blog set through a semantic API");
expectIncludes(apiPostsDataJs, '"Cache-Control", "no-store"', "post list endpoint should not cache public responses");
expectIncludes(apiPostDataJs, "fetchPublicPost", "post data endpoint should only serve posts from the public blog set");
expectIncludes(apiPostDataJs, "getPublicPostErrorStatus", "post data endpoint should reuse shared public-post error mapping");
expectIncludes(apiPostDataJs, '"Cache-Control", "no-store"', "post data endpoint should not cache public responses");
expectIncludes(publicContentJs, "rejectUnsupportedReadMethod", "public content helper should centralize read-only method guards");
const postsDataMethodNotAllowedRes = createApiResponseRecorder();
await apiPostsDataHandler({ method: "POST", query: {} }, postsDataMethodNotAllowedRes);
assert.equal(postsDataMethodNotAllowedRes.statusCode, 405, "post list endpoint should reject unsupported methods with HTTP 405");
assert.equal(postsDataMethodNotAllowedRes.getHeader("allow"), "GET", "post list endpoint should advertise the supported methods on 405 responses");
assert.equal(postsDataMethodNotAllowedRes.getHeader("cache-control"), "no-store", "post list endpoint should mark 405 responses as non-cacheable");
const postsDataHeadRes = createApiResponseRecorder();
await apiPostsDataHandler({ method: "HEAD", query: {} }, postsDataHeadRes);
assert.equal(postsDataHeadRes.statusCode, 405, "post list endpoint should reject HEAD without querying Notion");
const postDataMethodNotAllowedRes = createApiResponseRecorder();
await apiPostDataHandler({ method: "POST", query: {} }, postDataMethodNotAllowedRes);
assert.equal(postDataMethodNotAllowedRes.statusCode, 405, "post data endpoint should reject unsupported methods with HTTP 405");
assert.equal(postDataMethodNotAllowedRes.getHeader("allow"), "GET", "post data endpoint should advertise the supported methods on 405 responses");
assert.equal(postDataMethodNotAllowedRes.getHeader("cache-control"), "no-store", "post data endpoint should mark 405 responses as non-cacheable");
const postDataHeadRes = createApiResponseRecorder();
await apiPostDataHandler({ method: "HEAD", query: { id: "post-1" } }, postDataHeadRes);
assert.equal(postDataHeadRes.statusCode, 405, "post data endpoint should reject HEAD without loading the post detail tree");
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
  serverNotionHelpers,
  serverNotionJs,
  withEnvOverrides,
});
await runRoutingAndVercelChecks({
  assert,
  apiNotionHandler,
  apiNotionJs,
  apiSitemapJs,
  createApiResponseRecorder,
  expectIncludes,
  expectNotIncludes,
  vercelJson,
});
console.log("Smoke check passed.");
