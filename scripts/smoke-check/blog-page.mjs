export async function runBlogPageChecks(context) {
  const {
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
  } = context;

const blogFiltersEl = new FakeElement();
const blogSearchEl = new FakeElement();
const blogGridEl = new FakeElement();
const blogEmptyEl = new FakeElement();
const blogPaginationEl = new FakeElement();
const blogStatusEl = new FakeElement();
const blogTopActionsEl = new FakeElement();
const blogPageTitleEl = new FakeElement();
const allCategory = notionContentHelpers.ALL_CATEGORY || "All";
const topActionOverview = {
  classList: createClassList(),
  dataset: { nav: "overview" },
  querySelector: (selector) => (selector === "span" ? { textContent: "鎬昏" } : null),
};
const topActionBookmark = {
  classList: createClassList(),
  dataset: { nav: "bookmarks" },
  querySelector: (selector) => (selector === "span" ? { textContent: "鏀惰棌" } : null),
};
const blogLocation = new URL("https://example.com/blog.html");
const blogHistory = {
  pushCalls: [],
  replaceCalls: [],
  pushState(state, title, nextUrl) {
    this.pushCalls.push(String(nextUrl));
    blogLocation.href = new URL(String(nextUrl), blogLocation.href).href;
  },
  replaceState(state, title, nextUrl) {
    this.replaceCalls.push(String(nextUrl));
    blogLocation.href = new URL(String(nextUrl), blogLocation.href).href;
  },
};
loadBrowserScript("js/blog-page.js", {
  window: {
    location: blogLocation,
    history: blogHistory,
    scrollTo: () => {},
    NotionContent: notionContentHelpers,
    NotionAPI: {
      escapeHtml: (value) => String(value ?? ""),
      getCategoryColor: () => ({ bg: "#000", color: "#fff", border: "#222" }),
      getCategories: () => [
        { name: allCategory, emoji: "📚" },
        { name: "Tech", emoji: "🧠" },
        { name: "Bookmarks", emoji: "🔖" },
      ],
      getPageSize: () => 9,
      queryPosts: async () => ({
        results: [],
        categories: [
          { name: allCategory, label: allCategory, emoji: "📚" },
          { name: "AI", label: "AI Lab", emoji: "🤖" },
        ],
        total: 0,
        totalPages: 1,
        currentPage: 1,
      }),
    },
    PageRuntime: {
      register(pageId, pageModule) {
        registeredPages.set(pageId, pageModule);
      },
    },
    SiteUtils: {
      rememberBlogReturnUrl: () => {},
      sanitizeCoverBackground: (value, fallback) => value || fallback,
      resolveDisplayImageUrl: (value) => value,
      sanitizeImageUrl: (value) => value,
      buildPostPath: (postId) => `/posts/${postId}`,
      buildBookmarkListingUrl: buildBookmarkListingUrlMock,
      parseBookmarkListingHash: parseBookmarkListingHashMock,
    },
    updateSeoMeta: () => {},
    UIEffects: { initBlogCardReveal: () => null },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  },
  document: {
    getElementById(id) {
      return {
        blogFilters: blogFiltersEl,
        blogSearch: blogSearchEl,
        blogGrid: blogGridEl,
        emptyState: blogEmptyEl,
        pagination: blogPaginationEl,
        blogStatus: blogStatusEl,
        topActions: blogTopActionsEl,
      }[id] || null;
    },
    querySelector(selector) {
      return selector === ".page-title" ? blogPageTitleEl : null;
    },
    querySelectorAll(selector) {
      return selector === ".top-actions .action-btn"
        ? [topActionOverview, topActionBookmark]
        : [];
    },
    createElement() {
      return new FakeElement();
    },
  },
});
const blogPageCleanup = registeredPages.get("blog")?.init?.();
await Promise.resolve();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
  blogFiltersEl.children.some((child) => child.textContent === "🤖 AI Lab"),
  true,
  "blog page should refresh category filters from API-provided Notion categories",
);
assert.equal(
  blogFiltersEl.children.find((child) => child.dataset.category === allCategory)?.getAttribute("aria-pressed"),
  "true",
  "blog page should mark the active filter with aria-pressed",
);
assert.equal(
  blogFiltersEl.children.find((child) => child.dataset.category === "AI")?.getAttribute("aria-pressed"),
  "false",
  "blog page should mark inactive filters with aria-pressed=false",
);
const filterButton = {
    dataset: { category: "Tech" },
  closest(selector) {
    return selector === ".filter-btn" ? this : null;
  },
};
blogFiltersEl.dispatch("click", { target: filterButton });
assert.equal(
  blogHistory.pushCalls.at(-1),
  "/blog.html?category=Tech",
  "blog page should push filter state changes so browser back returns to the previous listing state",
);
blogSearchEl.value = "deep test";
blogSearchEl.dispatch("input");
await new Promise((resolve) => setTimeout(resolve, 350));
assert.equal(
  blogHistory.replaceCalls.at(-1),
  "/blog.html?category=Tech&search=deep+test",
  "blog page should replace the current history entry while live search text changes",
);
let didPreventOverviewNav = false;
blogTopActionsEl.dispatch("click", {
  target: {
    href: "https://example.com/blog.html",
    closest(selector) {
      return selector === "a[href]" ? this : null;
    },
  },
  preventDefault() {
    didPreventOverviewNav = true;
  },
});
assert.equal(
  didPreventOverviewNav,
  true,
  "blog page should intercept same-listing top action navigation for smoother in-page transitions",
);
assert.equal(
  blogHistory.pushCalls.at(-1),
  "/blog.html",
  "blog page should push overview navigation without falling back to native hash routing",
);
blogPageCleanup?.();
const dirtyQueryRegisteredPages = new Map();
const dirtyQueryFiltersEl = new FakeElement();
const dirtyQuerySearchEl = new FakeElement();
const dirtyQueryGridEl = new FakeElement();
const dirtyQueryEmptyEl = new FakeElement();
const dirtyQueryPaginationEl = new FakeElement();
const dirtyQueryStatusEl = new FakeElement();
const dirtyQueryTitleEl = new FakeElement();
const dirtyQueryCategory = "c".repeat(140);
const dirtyQuerySearch = "s".repeat(300);
const dirtyQueryLocation = new URL(
  `https://example.com/blog.html?category=%20${dirtyQueryCategory}%20&search=%20${dirtyQuerySearch}%20&page=2abc`,
);
const dirtyQueryHistory = {
  pushCalls: [],
  replaceCalls: [],
  pushState(state, title, nextUrl) {
    this.pushCalls.push(String(nextUrl));
    dirtyQueryLocation.href = new URL(String(nextUrl), dirtyQueryLocation.href).href;
  },
  replaceState(state, title, nextUrl) {
    this.replaceCalls.push(String(nextUrl));
    dirtyQueryLocation.href = new URL(String(nextUrl), dirtyQueryLocation.href).href;
  },
};
const dirtyQueryCalls = [];
loadBrowserScript("js/blog-page.js", {
  window: {
    location: dirtyQueryLocation,
    history: dirtyQueryHistory,
    scrollTo: () => {},
    NotionContent: notionContentHelpers,
    NotionAPI: {
      escapeHtml: (value) => String(value ?? ""),
      getCategoryColor: () => ({ bg: "#000", color: "#fff", border: "#222" }),
      getCategories: () => [
        { name: allCategory, emoji: "📚" },
      ],
      getPageSize: () => 9,
      queryPosts: async (query) => {
        dirtyQueryCalls.push(query);
        return {
          results: [],
          categories: [{ name: allCategory, label: allCategory, emoji: "📚" }],
          total: 0,
          totalPages: 1,
          currentPage: 1,
        };
      },
    },
    PageRuntime: {
      register(pageId, pageModule) {
        dirtyQueryRegisteredPages.set(pageId, pageModule);
      },
    },
    SiteUtils: {
      rememberBlogReturnUrl: () => {},
      sanitizeCoverBackground: (value, fallback) => value || fallback,
      resolveDisplayImageUrl: (value) => value,
      sanitizeImageUrl: (value) => value,
      buildPostPath: (postId) => `/posts/${postId}`,
      buildBookmarkListingUrl: buildBookmarkListingUrlMock,
      parseBookmarkListingHash: parseBookmarkListingHashMock,
    },
    updateSeoMeta: () => {},
    UIEffects: { initBlogCardReveal: () => null },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  },
  document: {
    getElementById(id) {
      return {
        blogFilters: dirtyQueryFiltersEl,
        blogSearch: dirtyQuerySearchEl,
        blogGrid: dirtyQueryGridEl,
        emptyState: dirtyQueryEmptyEl,
        pagination: dirtyQueryPaginationEl,
        blogStatus: dirtyQueryStatusEl,
      }[id] || null;
    },
    querySelector(selector) {
      return selector === ".page-title" ? dirtyQueryTitleEl : null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return new FakeElement();
    },
  },
});
const dirtyQueryCleanup = dirtyQueryRegisteredPages.get("blog")?.init?.();
await Promise.resolve();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
  dirtyQueryCalls[0]?.category,
  dirtyQueryCategory.slice(0, 128),
  "blog page should cap initial category query state before loading posts",
);
assert.equal(
  dirtyQueryCalls[0]?.search,
  dirtyQuerySearch.slice(0, 256),
  "blog page should cap initial search query state before loading posts",
);
assert.equal(
  dirtyQueryCalls[0]?.page,
  1,
  "blog page should reject partially numeric initial page values",
);
assert.ok(
  !dirtyQueryHistory.replaceCalls.at(0)?.includes("page="),
  "blog page should remove invalid page params when normalizing the listing URL",
);
dirtyQueryCleanup?.();
const defaultQueryRegisteredPages = new Map();
const defaultQueryFiltersEl = new FakeElement();
const defaultQuerySearchEl = new FakeElement();
const defaultQueryGridEl = new FakeElement();
const defaultQueryEmptyEl = new FakeElement();
const defaultQueryPaginationEl = new FakeElement();
const defaultQueryStatusEl = new FakeElement();
const defaultQueryTitleEl = new FakeElement();
const defaultQueryLocation = new URL(
  `https://example.com/blog.html?category=${encodeURIComponent(allCategory)}&search=&page=1`,
);
const defaultQueryHistory = {
  pushCalls: [],
  replaceCalls: [],
  pushState(state, title, nextUrl) {
    this.pushCalls.push(String(nextUrl));
    defaultQueryLocation.href = new URL(String(nextUrl), defaultQueryLocation.href).href;
  },
  replaceState(state, title, nextUrl) {
    this.replaceCalls.push(String(nextUrl));
    defaultQueryLocation.href = new URL(String(nextUrl), defaultQueryLocation.href).href;
  },
};
loadBrowserScript("js/blog-page.js", {
  window: {
    location: defaultQueryLocation,
    history: defaultQueryHistory,
    scrollTo: () => {},
    NotionContent: notionContentHelpers,
    NotionAPI: {
      escapeHtml: (value) => String(value ?? ""),
      getCategoryColor: () => ({ bg: "#000", color: "#fff", border: "#222" }),
      getCategories: () => [
        { name: allCategory, emoji: "📚" },
      ],
      getPageSize: () => 9,
      queryPosts: async () => ({
        results: [],
        categories: [{ name: allCategory, label: allCategory, emoji: "📚" }],
        total: 0,
        totalPages: 1,
        currentPage: 1,
      }),
    },
    PageRuntime: {
      register(pageId, pageModule) {
        defaultQueryRegisteredPages.set(pageId, pageModule);
      },
    },
    SiteUtils: {
      rememberBlogReturnUrl: () => {},
      sanitizeCoverBackground: (value, fallback) => value || fallback,
      resolveDisplayImageUrl: (value) => value,
      sanitizeImageUrl: (value) => value,
      buildPostPath: (postId) => `/posts/${postId}`,
      buildBookmarkListingUrl: buildBookmarkListingUrlMock,
      parseBookmarkListingHash: parseBookmarkListingHashMock,
    },
    updateSeoMeta: () => {},
    UIEffects: { initBlogCardReveal: () => null },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  },
  document: {
    getElementById(id) {
      return {
        blogFilters: defaultQueryFiltersEl,
        blogSearch: defaultQuerySearchEl,
        blogGrid: defaultQueryGridEl,
        emptyState: defaultQueryEmptyEl,
        pagination: defaultQueryPaginationEl,
        blogStatus: defaultQueryStatusEl,
      }[id] || null;
    },
    querySelector(selector) {
      return selector === ".page-title" ? defaultQueryTitleEl : null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return new FakeElement();
    },
  },
});
const defaultQueryCleanup = defaultQueryRegisteredPages.get("blog")?.init?.();
await Promise.resolve();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
  defaultQueryHistory.replaceCalls.at(0),
  "/blog.html",
  "blog page should remove default category, empty search, and first-page params from canonical listing URLs",
);
defaultQueryCleanup?.();
const paginationRegisteredPages = new Map();
const paginationFiltersEl = new FakeElement();
const paginationSearchEl = new FakeElement();
const paginationGridEl = new FakeElement();
const paginationEmptyEl = new FakeElement();
const paginationEl = new FakeElement();
const paginationStatusEl = new FakeElement();
const paginationTitleEl = new FakeElement();
const paginationLocation = new URL("https://example.com/blog.html?page=25");
const paginationHistory = {
  pushCalls: [],
  replaceCalls: [],
  pushState(state, title, nextUrl) {
    this.pushCalls.push(String(nextUrl));
    paginationLocation.href = new URL(String(nextUrl), paginationLocation.href).href;
  },
  replaceState(state, title, nextUrl) {
    this.replaceCalls.push(String(nextUrl));
    paginationLocation.href = new URL(String(nextUrl), paginationLocation.href).href;
  },
};
const paginationQueryPages = [];
const paginationScrollCalls = [];
const paginationPreloadNodes = [];
const paginationHead = {
  appendChild(node) {
    paginationPreloadNodes.push(node);
    node.remove = () => {
      const index = paginationPreloadNodes.indexOf(node);
      if (index >= 0) {
        paginationPreloadNodes.splice(index, 1);
      }
    };
    return node;
  },
  querySelectorAll(selector) {
    if (selector !== 'link[data-blog-cover-preload="true"]') return [];
    return paginationPreloadNodes.filter((node) => (
      node.dataset?.blogCoverPreload === "true" ||
      node.getAttribute?.("data-blog-cover-preload") === "true"
    ));
  },
};
loadBrowserScript("js/blog-page.js", {
  window: {
    location: paginationLocation,
    history: paginationHistory,
    scrollTo: (options) => paginationScrollCalls.push(options),
    NotionContent: notionContentHelpers,
    NotionAPI: {
      escapeHtml: (value) => String(value ?? ""),
      getCategoryColor: () => ({ bg: "#000", color: "#fff", border: "#222" }),
      getCategories: () => [
        { name: "All", emoji: "📚" },
        { name: "AI", emoji: "🤖" },
      ],
      getPageSize: () => 9,
      queryPosts: async ({ page }) => {
        paginationQueryPages.push(page);
        return {
          results: [{
            id: "pagination-window-post",
            title: "Pagination window",
            excerpt: "A fixture that keeps the listing non-empty.",
            category: "AI",
            date: "2026-05-14",
            readTime: "1 min",
            coverImage: `https://cdn.example.com/cover-${page}.jpg`,
            coverEmoji: "📝",
            coverGradient: "linear-gradient(135deg, #111111, #222222)",
            tags: ["Pagination"],
          }],
          categories: [
            { name: "All", label: "All", emoji: "📚" },
            { name: "AI", label: "AI Lab", emoji: "🤖" },
          ],
          total: 450,
          totalPages: 50,
          currentPage: page,
        };
      },
    },
    PageRuntime: {
      register(pageId, pageModule) {
        paginationRegisteredPages.set(pageId, pageModule);
      },
    },
    SiteUtils: {
      rememberBlogReturnUrl: () => {},
      sanitizeCoverBackground: (value, fallback) => value || fallback,
      resolveDisplayImageUrl: (value) => value,
      sanitizeImageUrl: (value) => value,
      buildPostPath: (postId) => `/posts/${postId}`,
      buildBookmarkListingUrl: buildBookmarkListingUrlMock,
      parseBookmarkListingHash: parseBookmarkListingHashMock,
    },
    updateSeoMeta: () => {},
    UIEffects: { initBlogCardReveal: () => null },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  },
  document: {
    head: paginationHead,
    getElementById(id) {
      return {
        blogFilters: paginationFiltersEl,
        blogSearch: paginationSearchEl,
        blogGrid: paginationGridEl,
        emptyState: paginationEmptyEl,
        pagination: paginationEl,
        blogStatus: paginationStatusEl,
      }[id] || null;
    },
    querySelector(selector) {
      return selector === ".page-title" ? paginationTitleEl : null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return new FakeElement();
    },
  },
});
const paginationCleanup = paginationRegisteredPages.get("blog")?.init?.();
await Promise.resolve();
await new Promise((resolve) => setTimeout(resolve, 0));
const paginationHtml = paginationEl.innerHTML;
const paginationButtonCount = (paginationHtml.match(/<button\b/g) || []).length;
const numberedPageButtonCount = (paginationHtml.match(/aria-label="第 \d+ 页"/g) || []).length;
assert.equal(
  paginationQueryPages.at(0),
  25,
  "blog pagination fixture should start on the requested deep page",
);
assert.ok(
  paginationButtonCount <= 9,
  "blog pagination should cap the rendered button count for long result sets",
);
assert.ok(
  numberedPageButtonCount <= 7,
  "blog pagination should cap numbered page buttons while preserving prev/next controls",
);
[1, 23, 24, 25, 26, 27, 50].forEach((page) => {
  assert.ok(
    paginationHtml.includes(`data-page="${page}"`),
    `blog pagination should keep page ${page} visible in the window`,
  );
});
assert.ok(
  paginationHtml.includes('data-page="25" aria-label="第 25 页" aria-current="page"'),
  "blog pagination should mark the current page in the page window",
);
assert.ok(
  paginationHtml.includes('class="pagination-ellipsis"'),
  "blog pagination should collapse skipped ranges behind ellipsis markers",
);
assert.ok(
  paginationHtml.includes('aria-label="上一页"') && paginationHtml.includes('aria-label="下一页"'),
  "blog pagination should render previous and next controls",
);
assert.equal(
  paginationPreloadNodes.length,
  1,
  "blog page should keep only the current render's cover preload links in the document head",
);
assert.equal(
  paginationPreloadNodes[0]?.dataset?.blogCoverPreload,
  "true",
  "blog page should mark cover preload links for later cleanup",
);
const paginationNextButton = {
  dataset: { page: "26" },
  disabled: false,
  closest(selector) {
    return selector === ".page-btn" ? this : null;
  },
};
paginationEl.dispatch("click", { target: paginationNextButton });
await Promise.resolve();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
  paginationHistory.pushCalls.at(-1),
  "/blog.html?page=26",
  "blog pagination next control should push the requested page into the listing URL",
);
assert.equal(
  paginationScrollCalls.at(-1)?.behavior,
  "auto",
  "blog pagination should keep instant scroll behavior after changing pages",
);
assert.equal(
  paginationPreloadNodes.length,
  1,
  "blog page should replace stale cover preload links instead of growing the document head",
);
assert.equal(
  paginationPreloadNodes[0]?.href,
  "https://cdn.example.com/cover-26.jpg",
  "blog page should keep the newest cover preload link after pagination changes",
);
paginationCleanup?.();
assert.equal(
  paginationPreloadNodes.length,
  0,
  "blog page should remove cover preload links when the page runtime is disposed",
);
const legacyBookmarkRegisteredPages = new Map();
const legacyBookmarkFiltersEl = new FakeElement();
const legacyBookmarkSearchEl = new FakeElement();
const legacyBookmarkGridEl = new FakeElement();
const legacyBookmarkEmptyEl = new FakeElement();
const legacyBookmarkPaginationEl = new FakeElement();
const legacyBookmarkStatusEl = new FakeElement();
const legacyBookmarkTitleEl = new FakeElement();
const legacyBookmarkOverviewAction = {
  classList: createClassList(),
  dataset: { nav: "overview" },
  querySelector: (selector) => (selector === "span" ? { textContent: "鎬昏" } : null),
};
const legacyBookmarkAction = {
  classList: createClassList(),
  dataset: { nav: "bookmarks" },
  querySelector: (selector) => (selector === "span" ? { textContent: "鏀惰棌" } : null),
};
const legacyBookmarkLocation = new URL("https://example.com/blog.html?category=%E6%94%B6%E8%97%8F&search=Alpha&page=2");
const legacyBookmarkHistory = {
  pushCalls: [],
  replaceCalls: [],
  pushState(state, title, nextUrl) {
    this.pushCalls.push(String(nextUrl));
    legacyBookmarkLocation.href = new URL(String(nextUrl), legacyBookmarkLocation.href).href;
  },
  replaceState(state, title, nextUrl) {
    this.replaceCalls.push(String(nextUrl));
    legacyBookmarkLocation.href = new URL(String(nextUrl), legacyBookmarkLocation.href).href;
  },
};
loadBrowserScript("js/blog-page.js", {
  window: {
    location: legacyBookmarkLocation,
    history: legacyBookmarkHistory,
    scrollTo: () => {},
    NotionContent: notionContentHelpers,
    NotionAPI: {
      escapeHtml: (value) => String(value ?? ""),
      getCategoryColor: () => ({ bg: "#000", color: "#fff", border: "#222" }),
      getCategories: () => [
        { name: "All", emoji: "📚" },
        { name: "Tech", emoji: "🧠" },
      ],
      getPageSize: () => 9,
      queryPosts: async () => ({
        results: [],
        total: 0,
        totalPages: 1,
        currentPage: 1,
      }),
    },
    PageRuntime: {
      register(pageId, pageModule) {
        legacyBookmarkRegisteredPages.set(pageId, pageModule);
      },
    },
    SiteUtils: {
      rememberBlogReturnUrl: () => {},
      sanitizeCoverBackground: (value, fallback) => value || fallback,
      resolveShareImageUrl: (value) => value,
      resolveDisplayImageUrl: (value) => value,
      sanitizeImageUrl: (value) => value,
      buildPostPath: (postId) => `/posts/${postId}`,
      buildBookmarkListingUrl: buildBookmarkListingUrlMock,
      parseBookmarkListingHash: parseBookmarkListingHashMock,
    },
    updateSeoMeta: () => {},
    UIEffects: { initBlogCardReveal: () => null },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  },
  document: {
    getElementById(id) {
      return {
        blogFilters: legacyBookmarkFiltersEl,
        blogSearch: legacyBookmarkSearchEl,
        blogGrid: legacyBookmarkGridEl,
        emptyState: legacyBookmarkEmptyEl,
        pagination: legacyBookmarkPaginationEl,
        blogStatus: legacyBookmarkStatusEl,
      }[id] || null;
    },
    querySelector(selector) {
      return selector === ".page-title" ? legacyBookmarkTitleEl : null;
    },
    querySelectorAll(selector) {
      return selector === ".top-actions .action-btn"
        ? [legacyBookmarkOverviewAction, legacyBookmarkAction]
        : [];
    },
    createElement() {
      return new FakeElement();
    },
  },
});
const legacyBookmarkCleanup = legacyBookmarkRegisteredPages.get("blog")?.init?.();
await Promise.resolve();
assert.equal(
  legacyBookmarkHistory.replaceCalls.at(0),
  "/blog.html#bookmarks?search=Alpha&page=2",
  "blog page should normalize legacy bookmark query routes onto the hash-only bookmark view URL",
);
legacyBookmarkCleanup?.();
const emptyBookmarkQueryRegisteredPages = new Map();
const emptyBookmarkQueryFiltersEl = new FakeElement();
const emptyBookmarkQuerySearchEl = new FakeElement();
const emptyBookmarkQueryGridEl = new FakeElement();
const emptyBookmarkQueryEmptyEl = new FakeElement();
const emptyBookmarkQueryPaginationEl = new FakeElement();
const emptyBookmarkQueryStatusEl = new FakeElement();
const emptyBookmarkQueryTitleEl = new FakeElement();
const emptyBookmarkQueryLocation = new URL("https://example.com/blog.html?category=&search=&page=#bookmarks");
const emptyBookmarkQueryHistory = {
  pushCalls: [],
  replaceCalls: [],
  pushState(state, title, nextUrl) {
    this.pushCalls.push(String(nextUrl));
    emptyBookmarkQueryLocation.href = new URL(String(nextUrl), emptyBookmarkQueryLocation.href).href;
  },
  replaceState(state, title, nextUrl) {
    this.replaceCalls.push(String(nextUrl));
    emptyBookmarkQueryLocation.href = new URL(String(nextUrl), emptyBookmarkQueryLocation.href).href;
  },
};
loadBrowserScript("js/blog-page.js", {
  window: {
    location: emptyBookmarkQueryLocation,
    history: emptyBookmarkQueryHistory,
    scrollTo: () => {},
    NotionContent: notionContentHelpers,
    BookmarkManager: {
      getAll: () => [],
      isBookmarked: () => false,
      toggleById: () => null,
      hasLegacyMetadata: () => false,
    },
    PageRuntime: {
      register(pageId, pageModule) {
        emptyBookmarkQueryRegisteredPages.set(pageId, pageModule);
      },
    },
    SiteUtils: {
      rememberBlogReturnUrl: () => {},
      sanitizeCoverBackground: (value, fallback) => value || fallback,
      resolveShareImageUrl: (value) => value,
      resolveDisplayImageUrl: (value) => value,
      sanitizeImageUrl: (value) => value,
      buildPostPath: (postId) => `/posts/${postId}`,
      buildBookmarkListingUrl: buildBookmarkListingUrlMock,
      parseBookmarkListingHash: parseBookmarkListingHashMock,
    },
    updateSeoMeta: () => {},
    UIEffects: { initBlogCardReveal: () => null },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  },
  document: {
    getElementById(id) {
      return {
        blogFilters: emptyBookmarkQueryFiltersEl,
        blogSearch: emptyBookmarkQuerySearchEl,
        blogGrid: emptyBookmarkQueryGridEl,
        emptyState: emptyBookmarkQueryEmptyEl,
        pagination: emptyBookmarkQueryPaginationEl,
        blogStatus: emptyBookmarkQueryStatusEl,
      }[id] || null;
    },
    querySelector(selector) {
      return selector === ".page-title" ? emptyBookmarkQueryTitleEl : null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return new FakeElement();
    },
  },
});
const emptyBookmarkQueryCleanup = emptyBookmarkQueryRegisteredPages.get("blog")?.init?.();
await Promise.resolve();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
  emptyBookmarkQueryHistory.replaceCalls.at(0),
  "/blog.html#bookmarks",
  "blog page should remove empty query params when normalizing bookmark hash routes",
);
emptyBookmarkQueryCleanup?.();
const bookmarkHashRegisteredPages = new Map();
const bookmarkHashFiltersEl = new FakeElement();
const bookmarkHashSearchEl = new FakeElement();
const bookmarkHashGridEl = new FakeElement();
const bookmarkHashEmptyEl = new FakeElement();
const bookmarkHashPaginationEl = new FakeElement();
const bookmarkHashStatusEl = new FakeElement();
const bookmarkHashTitleEl = new FakeElement();
const bookmarkHashHandlers = new Set();
const bookmarkHashUpdateHandlers = new Set();
const bookmarkHashOverviewAction = {
  classList: createClassList(),
  dataset: { nav: "overview" },
  querySelector: (selector) => (selector === "span" ? { textContent: "鎬昏" } : null),
};
const bookmarkHashAction = {
  classList: createClassList(),
  dataset: { nav: "bookmarks" },
  querySelector: (selector) => (selector === "span" ? { textContent: "鏀惰棌" } : null),
};
const bookmarkHashLocation = new URL("https://example.com/blog.html#bookmarks?search=TypeScript%20%20Testing&page=3");
const bookmarkHashHistory = {
  pushCalls: [],
  replaceCalls: [],
  pushState(state, title, nextUrl) {
    this.pushCalls.push(String(nextUrl));
    bookmarkHashLocation.href = new URL(String(nextUrl), bookmarkHashLocation.href).href;
  },
  replaceState(state, title, nextUrl) {
    this.replaceCalls.push(String(nextUrl));
    bookmarkHashLocation.href = new URL(String(nextUrl), bookmarkHashLocation.href).href;
  },
};
let bookmarkHashEntries = [{
  id: "bookmark-hit",
  title: "Bookmark hit",
  excerpt: "Local only",
  category: "",
  date: "",
  readTime: "",
  coverImage: null,
  coverEmoji: "馃摑",
  coverGradient: "linear-gradient(135deg, #111111, #222222)",
  tags: ["TypeScript", "Testing"],
}];
loadBrowserScript("js/blog-page.js", {
  window: {
    location: bookmarkHashLocation,
    history: bookmarkHashHistory,
    scrollTo: () => {},
    NotionContent: notionContentHelpers,
    BookmarkManager: {
      getAll: () => bookmarkHashEntries,
      isBookmarked: () => true,
      toggleById: () => true,
      hasLegacyMetadata: () => false,
    },
    PageRuntime: {
      register(pageId, pageModule) {
        bookmarkHashRegisteredPages.set(pageId, pageModule);
      },
    },
    SiteUtils: {
      rememberBlogReturnUrl: () => {},
      sanitizeCoverBackground: (value, fallback) => value || fallback,
      resolveShareImageUrl: (value) => value,
      resolveDisplayImageUrl: (value) => value,
      sanitizeImageUrl: (value) => value,
      buildPostPath: (postId) => `/posts/${postId}`,
      buildBookmarkListingUrl: buildBookmarkListingUrlMock,
      parseBookmarkListingHash: parseBookmarkListingHashMock,
    },
    updateSeoMeta: () => {},
    UIEffects: { initBlogCardReveal: () => null },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    addEventListener(type, handler) {
      if (type === "hashchange") {
        bookmarkHashHandlers.add(handler);
      } else if (type === "bookmarks:updated") {
        bookmarkHashUpdateHandlers.add(handler);
      }
    },
    removeEventListener(type, handler) {
      if (type === "hashchange") {
        bookmarkHashHandlers.delete(handler);
      } else if (type === "bookmarks:updated") {
        bookmarkHashUpdateHandlers.delete(handler);
      }
    },
  },
  document: {
    getElementById(id) {
      return {
        blogFilters: bookmarkHashFiltersEl,
        blogSearch: bookmarkHashSearchEl,
        blogGrid: bookmarkHashGridEl,
        emptyState: bookmarkHashEmptyEl,
        pagination: bookmarkHashPaginationEl,
        blogStatus: bookmarkHashStatusEl,
      }[id] || null;
    },
    querySelector(selector) {
      return selector === ".page-title" ? bookmarkHashTitleEl : null;
    },
    querySelectorAll(selector) {
      return selector === ".top-actions .action-btn"
        ? [bookmarkHashOverviewAction, bookmarkHashAction]
        : [];
    },
    createElement() {
      return new FakeElement();
    },
  },
});
const bookmarkHashCleanup = bookmarkHashRegisteredPages.get("blog")?.init?.();
await Promise.resolve();
assert.equal(
  bookmarkHashHistory.replaceCalls.at(0),
  "/blog.html#bookmarks?search=TypeScript++Testing&page=3",
  "blog page should preserve bookmark search and page params when it falls back to its local bookmark hash URL builder",
);
assert.ok(
  bookmarkHashGridEl.innerHTML.includes("Bookmark hit"),
  "blog page should keep bookmark search matches when the query contains extra whitespace",
);
bookmarkHashEntries = [];
bookmarkHashUpdateHandlers.forEach((handler) => handler());
await Promise.resolve();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(
  !bookmarkHashGridEl.innerHTML.includes("Bookmark hit"),
  "blog page should refresh the local bookmark view after cross-tab bookmark updates",
);
bookmarkHashLocation.hash = "";
bookmarkHashHandlers.forEach((handler) => handler());
assert.equal(
  bookmarkHashHistory.replaceCalls.at(-1),
  "/blog.html#bookmarks?search=TypeScript++Testing",
  "blog page should keep the local bookmark view pinned to the bookmark hash route when the remote source is unavailable",
);
bookmarkHashCleanup?.();
assert.equal(
  bookmarkHashUpdateHandlers.size,
  0,
  "blog page should remove cross-tab bookmark listeners during cleanup",
);

}
