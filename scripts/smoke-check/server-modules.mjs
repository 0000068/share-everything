export function runServerModuleChecks(context) {
  const {
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
  } = context;

  expectIncludes(serverNotionJs, 'require("./notion-client")', "Notion server should re-export the focused client helpers");
  expectIncludes(serverNotionJs, 'require("./post-service")', "Notion server should re-export the focused post service helpers");
  expectIncludes(serverNotionJs, 'require("./render-service")', "Notion server should re-export the focused render helpers");
  expectNotIncludes(serverNotionJs, 'require("node:fs")', "Notion server should leave filesystem config reads to notion-config.js");
  expectNotIncludes(serverNotionJs, "function normalizeSiteOrigin", "Notion server should not keep site-origin normalization inline");
  expectNotIncludes(serverNotionJs, "function createCategoryNavigation", "Notion server should not keep category navigation assembly inline");
  expectIncludes(serverNotionClientJs, 'require("./notion-config")', "notion-client.js should import shared configuration helpers");
  expectIncludes(serverPostServiceJs, 'require("./category-navigation")', "post-service.js should import focused category navigation helpers");
  expectIncludes(serverNotionSchemaJs, "function buildContentSchema", "notion-schema.js should own content schema resolution");
  expectIncludes(serverPublicPolicyJs, "function buildPublicAccessPolicyFromDatabase", "public-policy.js should own public access policy assembly");
  expectIncludes(serverPostServiceJs, "function queryPublicPosts", "post-service.js should own public list and pagination behavior");
  expectIncludes(serverBlockServiceJs, "function fetchAllBlockChildren", "block-service.js should own recursive block loading");
  expectIncludes(serverBlockServiceJs, "NOTION_BLOCK_TOTAL_LIMIT", "block-service.js should bound total recursive block loading");
  expectIncludes(serverCacheStoreJs, "function createLruTtlCache", "cache-store.js should own reusable TTL/LRU caches");
  expectIncludes(serverCacheStoreJs, "errorCooldownMs", "cache-store.js should support optional single-flight error cooldowns");
  expectIncludes(serverPostServiceJs, "shouldStartCacheSweepTimer", "post-service.js should gate cache sweep timers by runtime");
  expectIncludes(serverRenderServiceJs, "function buildArticleStructuredData", "render-service.js should own SSR structured data helpers");
  expectIncludes(serverRenderServiceJs, "siteName: getSiteName()", "render-service.js should pass the configured site name into JSON-LD");
  expectIncludes(serverNotionConfigJs, "function normalizeSiteOrigin", "notion-config.js should own site-origin normalization");
  expectIncludes(serverNotionConfigJs, "function getSiteName", "notion-config.js should own site-name normalization");
  expectIncludes(serverNotionConfigJs, "function createAsyncLimiter", "notion-config.js should own the async concurrency limiter");
  expectIncludes(serverCategoryNavigationJs, 'require("../js/notion-content-shared")', "category-navigation.js should import lightweight shared content constants");
  expectIncludes(serverCategoryNavigationJs, 'require("../js/notion-content-utils")', "category-navigation.js should import lightweight content utility helpers");
  expectNotIncludes(serverCategoryNavigationJs, 'require("../js/notion-content")', "category-navigation.js should not load the full renderer for constants");
  expectIncludes(serverCategoryNavigationJs, "function createCategoryNavigation", "category-navigation.js should own category presentation assembly");
  expectIncludes(serverCategoryNavigationJs, "function readCategorySelectOptions", "category-navigation.js should own Notion select option extraction");
  expectIncludes(siteArchitectureMd, "`server/notion-config.js` owns environment and site-origin normalization", "architecture docs should describe the server configuration split");
  expectIncludes(siteArchitectureMd, "`server/category-navigation.js` owns Notion-driven category presentation", "architecture docs should describe the server category split");
  expectIncludes(siteArchitectureMd, "`server/notion-client.js` owns Notion HTTP requests", "architecture docs should describe the Notion client split");
  expectIncludes(siteArchitectureMd, "`server/post-service.js` owns public post listing, filtering, pagination", "architecture docs should describe the post service split");
  expectIncludes(siteArchitectureMd, "`NOTION_BLOCK_TOTAL_LIMIT`", "architecture docs should describe the block budget tuning knob");

  assert.equal(
    serverNotionConfigHelpers.normalizeSiteOrigin("https://user:pass@example.com/blog/?preview=1#top"),
    "https://example.com/blog",
    "notion-config.js should normalize configured site URLs before server use",
  );
  assert.equal(
    serverNotionConfigHelpers.normalizePositiveNumber("0", 12),
    12,
    "notion-config.js should reject non-positive numeric env overrides",
  );
  const ttlSlot = serverCacheStoreHelpers.createTtlSlot();
  ttlSlot.set(0, Date.now() + 1_000);
  assert.equal(
    ttlSlot.get(),
    0,
    "cache-store.js should preserve falsy cached values until they expire",
  );
  const lruTtlCache = serverCacheStoreHelpers.createLruTtlCache({ maxEntries: 1 });
  lruTtlCache.set("", "empty-key", Date.now() + 1_000);
  lruTtlCache.set("next", "next-key", Date.now() + 1_000);
  assert.equal(
    lruTtlCache.get(""),
    null,
    "cache-store.js should evict an empty-string key when pruning LRU overflow",
  );
  assert.equal(
    lruTtlCache.get("next"),
    "next-key",
    "cache-store.js should retain the newest entry after LRU overflow pruning",
  );
  const categoryNavigationHarness = serverCategoryNavigationHelpers.createCategoryNavigation({
    featured: {
      name: "\u7cbe\u9009",
      label: "\u7cbe\u9009\u6587\u7ae0",
      emoji: "*",
    },
    order: ["Tech"],
    displayNames: { Tech: "\u6280\u672f" },
    emojis: { Tech: "T" },
  });
  const publicCategoriesFromSplitModule = categoryNavigationHarness.buildPublicCategories({
    database: {
      properties: {
        Category: {
          id: "category-id",
          name: "Category",
          type: "select",
          select: {
            options: [
              { name: "Tech", color: "blue" },
            ],
          },
        },
      },
    },
    schema: { category: { id: "category-id", name: "Category", type: "select" } },
    posts: [{ category: "Life" }],
  });
  assert.equal(
    publicCategoriesFromSplitModule[0].name,
    "\u5168\u90e8",
    "category-navigation.js should keep the all-posts category pinned first",
  );
  assert.equal(
    publicCategoriesFromSplitModule[1].label,
    "\u7cbe\u9009\u6587\u7ae0",
    "category-navigation.js should apply configured featured category labels",
  );
  assert.ok(
    publicCategoriesFromSplitModule.some((category) => category.label === "\u6280\u672f"),
    "category-navigation.js should apply configured display labels to Notion categories",
  );

  const repeatedColorCategoryNavigation = serverCategoryNavigationHelpers.createCategoryNavigation({
    featured: {
      name: "\u7cbe\u9009",
      emoji: "\u{1f31f}",
    },
  });
  const repeatedColorCategories = repeatedColorCategoryNavigation.buildPublicCategories({
    database: {
      properties: {
        Category: {
          id: "category-id",
          name: "Category",
          type: "select",
          select: {
            options: [
              { name: "\u5de5\u5177", color: "yellow" },
              { name: "\u6280\u672f", color: "yellow" },
              { name: "\u6559\u7a0b", color: "yellow" },
            ],
          },
        },
      },
    },
    schema: { category: { id: "category-id", name: "Category", type: "select" } },
  });
  const repeatedColorEmojis = repeatedColorCategories.map((category) => category.emoji).filter(Boolean);
  assert.equal(
    new Set(repeatedColorEmojis).size,
    repeatedColorEmojis.length,
    "category-navigation.js should avoid duplicate automatic category icons when Notion colors repeat",
  );
}
