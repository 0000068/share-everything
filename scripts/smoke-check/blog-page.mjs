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
const topActionOverview = {
  classList: createClassList(),
  querySelector: (selector) => (selector === "span" ? { textContent: "鎬昏" } : null),
};
const topActionBookmark = {
  classList: createClassList(),
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
    NotionAPI: {
      escapeHtml: (value) => String(value ?? ""),
      getCategoryColor: () => ({ bg: "#000", color: "#fff", border: "#222" }),
      getCategories: () => [
        { name: "All", emoji: "📚" },
        { name: "Tech", emoji: "🧠" },
        { name: "Bookmarks", emoji: "🔖" },
      ],
      getPageSize: () => 9,
      queryPosts: async () => ({
        results: [],
        categories: [
          { name: "All", label: "All", emoji: "📚" },
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
    initBlogCardReveal: () => null,
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
  querySelector: (selector) => (selector === "span" ? { textContent: "鎬昏" } : null),
};
const legacyBookmarkAction = {
  classList: createClassList(),
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
    initBlogCardReveal: () => null,
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
const bookmarkHashRegisteredPages = new Map();
const bookmarkHashFiltersEl = new FakeElement();
const bookmarkHashSearchEl = new FakeElement();
const bookmarkHashGridEl = new FakeElement();
const bookmarkHashEmptyEl = new FakeElement();
const bookmarkHashPaginationEl = new FakeElement();
const bookmarkHashStatusEl = new FakeElement();
const bookmarkHashTitleEl = new FakeElement();
const bookmarkHashHandlers = new Set();
const bookmarkHashOverviewAction = {
  classList: createClassList(),
  querySelector: (selector) => (selector === "span" ? { textContent: "鎬昏" } : null),
};
const bookmarkHashAction = {
  classList: createClassList(),
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
loadBrowserScript("js/blog-page.js", {
  window: {
    location: bookmarkHashLocation,
    history: bookmarkHashHistory,
    scrollTo: () => {},
    BookmarkManager: {
      getAll: () => [{
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
      }],
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
    },
    updateSeoMeta: () => {},
    initBlogCardReveal: () => null,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    addEventListener(type, handler) {
      if (type === "hashchange") {
        bookmarkHashHandlers.add(handler);
      }
    },
    removeEventListener(type, handler) {
      if (type === "hashchange") {
        bookmarkHashHandlers.delete(handler);
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
bookmarkHashLocation.hash = "";
bookmarkHashHandlers.forEach((handler) => handler());
assert.equal(
  bookmarkHashHistory.replaceCalls.at(-1),
  "/blog.html#bookmarks?search=TypeScript++Testing",
  "blog page should keep the local bookmark view pinned to the bookmark hash route when the remote source is unavailable",
);
bookmarkHashCleanup?.();

}
