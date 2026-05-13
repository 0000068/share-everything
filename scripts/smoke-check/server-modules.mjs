export function runServerModuleChecks(context) {
  const {
    assert,
    expectIncludes,
    expectNotIncludes,
    serverCategoryNavigationHelpers,
    serverCategoryNavigationJs,
    serverNotionConfigHelpers,
    serverNotionConfigJs,
    serverNotionJs,
    siteArchitectureMd,
  } = context;

  expectIncludes(serverNotionJs, 'require("./notion-config")', "Notion server should import shared configuration helpers");
  expectIncludes(serverNotionJs, 'require("./category-navigation")', "Notion server should import focused category navigation helpers");
  expectNotIncludes(serverNotionJs, 'require("node:fs")', "Notion server should leave filesystem config reads to notion-config.js");
  expectNotIncludes(serverNotionJs, "function normalizeSiteOrigin", "Notion server should not keep site-origin normalization inline");
  expectNotIncludes(serverNotionJs, "function createCategoryNavigation", "Notion server should not keep category navigation assembly inline");
  expectIncludes(serverNotionConfigJs, "function normalizeSiteOrigin", "notion-config.js should own site-origin normalization");
  expectIncludes(serverNotionConfigJs, "function createAsyncLimiter", "notion-config.js should own the async concurrency limiter");
  expectIncludes(serverCategoryNavigationJs, 'require("../js/notion-content-shared")', "category-navigation.js should import lightweight shared content constants");
  expectIncludes(serverCategoryNavigationJs, 'require("../js/notion-content-utils")', "category-navigation.js should import lightweight content utility helpers");
  expectNotIncludes(serverCategoryNavigationJs, 'require("../js/notion-content")', "category-navigation.js should not load the full renderer for constants");
  expectIncludes(serverCategoryNavigationJs, "function createCategoryNavigation", "category-navigation.js should own category presentation assembly");
  expectIncludes(serverCategoryNavigationJs, "function readCategorySelectOptions", "category-navigation.js should own Notion select option extraction");
  expectIncludes(siteArchitectureMd, "`server/notion-config.js` owns environment and site-origin normalization", "architecture docs should describe the server configuration split");
  expectIncludes(siteArchitectureMd, "`server/category-navigation.js` owns Notion-driven category presentation", "architecture docs should describe the server category split");

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
}
