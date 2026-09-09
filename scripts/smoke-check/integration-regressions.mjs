import vm from "node:vm";
import * as parse5 from "parse5";
import {
  assert,
  createApiResponseRecorder,
  createJsonResponse,
  createStorageMock,
  FakeElement,
  loadBrowserScript,
  loadCommonJsModule,
  read,
  withEnvOverrides,
} from "./harness.mjs";
import { createSpaRouterHarness, createRouteDocument } from "./spa-router.mjs";

const postId = "0123456789abcdef0123456789abcdef";
const signature = "s".repeat(43);
const post = {
  id: postId,
  title: "Integration article",
  category: "Tech",
  coverImage: "https://assets.example.com/cover.png",
  coverImageSignature: signature,
  tags: [],
  content: [{ type: "paragraph", text: "Article SSR sentinel" }],
};

// Load the actual foundations and clients in one browser global. This catches
// missing wiring that isolated modules with mocked SiteUtils cannot detect.
function createContentBrowser({
  sessionStorage = createStorageMock(),
  localStorage = createStorageMock(),
  fullArticle = false,
  fetch = async () => createJsonResponse({ results: [], currentPage: 1, totalPages: 1, total: 0 }),
} = {}) {
  const browser = {
    URL, URLSearchParams, AbortController, setTimeout, clearTimeout, console,
    sessionStorage, localStorage, fetch,
    location: new URL("https://example.com/blog.html"),
    innerWidth: 1280,
    navigator: {},
    CSS: { escape: String },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    CustomEvent: class {
      constructor(type, options) { this.type = type; this.detail = options?.detail; }
    },
    document: {
      querySelector: () => null,
      body: { dataset: { page: "blog" } },
      documentElement: { clientWidth: 1280, classList: { toggle() {} } },
    },
  };
  browser.window = browser;
  const context = vm.createContext(browser);
  const files = [
    "js/notion-content-shared.js", "js/site-utils.js",
    "js/notion-content-utils.js", "js/notion-content-url.js",
    ...(fullArticle ? ["js/notion-article-renderer.js", "js/notion-content.js"] : []),
    "js/notion-api.js", "js/bookmark.js",
  ];
  files.forEach((file) => vm.runInContext(read(file), context, { filename: file }));
  return browser;
}

async function checkBookmarkModuleComposition() {
  for (const fullArticle of [false, true]) {
    const browser = createContentBrowser({ fullArticle });
    browser.BookmarkManager.toggle(post);
    const saved = browser.BookmarkManager.getAll()[0];
    assert.equal(saved.coverImageSignature, signature, "listing and article entry points must preserve the actual cover signature");
    assert.match(browser.SiteUtils.resolveCoverImageUrl(saved.coverImage, { signature }), /\/api\/cover\?/);
    assert.match(browser.SiteUtils.buildCoverImageSrcSet(saved.coverImage, { signature }), /\/api\/cover\?/);
  }

  const sessionStorage = createStorageMock();
  const localStorage = createStorageMock();
  const completePost = {
    ...post,
    title: "T".repeat(200),
    excerpt: "E".repeat(400),
    tags: Array.from({ length: 12 }, (_, index) => `Tag ${index}`),
    coverImage: `${post.coverImage}?X-Amz-Signature=fixture&X-Amz-Expires=3600`,
  };
  const first = createContentBrowser({
    sessionStorage, localStorage,
    fetch: async () => createJsonResponse({ results: [completePost], currentPage: 1, totalPages: 1, total: 1 }),
  });
  await first.NotionAPI.queryPosts();
  first.BookmarkManager.toggle(completePost);
  let reloadFetches = 0;
  const reloaded = createContentBrowser({
    sessionStorage, localStorage,
    fetch: async () => { reloadFetches += 1; return createJsonResponse(completePost); },
  });
  assert.equal(reloaded.NotionAPI.getPostSummary(postId).isPartial, true);
  assert.equal(reloaded.BookmarkManager.getDisplayEntries()[0].coverImage, completePost.coverImage);
  assert.equal(await reloaded.BookmarkManager.hydrateMissingMetadata(), false);
  assert.equal(reloadFetches, 0, "fresh bookmarks must not refetch or overwrite their complete metadata after reload");
  let persisted = JSON.parse(localStorage.getItem("bookmarked_posts"))[0];
  assert.equal(persisted.coverImage, completePost.coverImage);
  assert.equal(persisted.title, completePost.title);
  assert.equal(persisted.tags.length, 12);

  // Repair records saved by the previous generation, even if that generation
  // recently persisted an omitted cover as null. Never use the compact cache
  // as a full metadata refresh.
  localStorage.setItem("bookmarked_posts", JSON.stringify([{ ...persisted, metadataVersion: 6, coverImage: null }]));
  const migrated = createContentBrowser({
    sessionStorage, localStorage,
    fetch: async () => { reloadFetches += 1; return createJsonResponse(completePost); },
  });
  assert.equal(await migrated.BookmarkManager.hydrateMissingMetadata(), true);
  assert.equal(reloadFetches, 1);
  persisted = JSON.parse(localStorage.getItem("bookmarked_posts"))[0];
  assert.equal(persisted.coverImage, completePost.coverImage);
  assert.equal(persisted.title, completePost.title);
  assert.equal(persisted.tags.length, 12);
}

async function checkCategoryIdentifiers() {
  const names = ["C".repeat(48) + "first", "C".repeat(48) + "second", "L".repeat(128)];
  const browser = createContentBrowser({
    fetch: async () => createJsonResponse({
      results: names.map((category) => ({ ...post, category })),
      categories: names.map((name) => ({ name })),
      currentPage: 1, totalPages: 1, total: 3,
    }),
  });
  const data = await browser.NotionAPI.queryPosts();
  assert.deepEqual(Array.from(data.categories, (category) => category.name), names);
  assert.deepEqual(Array.from(data.results, (entry) => entry.category), names);
}

function checkTablesAndPublicPolicy() {
  const content = loadCommonJsModule("js/notion-content.js");
  const html = content.renderBlocks([{
    type: "table", hasColumnHeader: true, hasRowHeader: true,
    children: [
      { type: "table_row", cells: ["COLUMN_HEADER", "Second"] },
      { type: "table_row", cells: ["ROW_HEADER", "BODY_SENTINEL"] },
      { type: "paragraph", text: "TRAILING_SENTINEL" },
    ],
  }]);
  assert.equal((html.match(/<table /g) || []).length, 1);
  assert.equal((html.match(/<tr>/g) || []).length, 2);
  for (const sentinel of ["COLUMN_HEADER", "ROW_HEADER", "BODY_SENTINEL", "TRAILING_SENTINEL"]) {
    assert.equal(html.split(sentinel).length - 1, 1, `table content should appear once: ${sentinel}`);
  }
  assert.match(html, /<th scope="row">ROW_HEADER<\/th>/);
  assert.match(content.renderBlocks([{ type: "table_row", cells: ["Standalone"] }]), /<td>Standalone<\/td>/);

  const policy = loadCommonJsModule("server/public-policy.js");
  withEnvOverrides({ NOTION_DATABASE_ID: "11111111111111111111111111111111" }, () => {
    const page = { parent: { database_id: process.env.NOTION_DATABASE_ID } };
    const publicAccess = policy.buildPublicAccessPolicyFromDatabase();
    assert.equal(policy.assertPublicPage(page, publicAccess), page);
    for (const flags of [{ archived: true }, { in_trash: true }, { archived: true, in_trash: true }]) {
      assert.throws(() => policy.assertPublicPage({ ...page, ...flags }, publicAccess), (error) => error.status === 404);
    }
  });
}

async function checkRewrittenArticleRoutes() {
  const serverHelpers = loadCommonJsModule("server/notion-server.js");
  let rendered = 0;
  const handler = loadCommonJsModule("api/post.js", [], {
    __parse5ForSmokeCheck: parse5,
    __moduleMocks: {
      "../server/notion-server": {
        ...serverHelpers,
        getSiteOrigin: () => "https://example.com",
        buildPostUrl: (id) => `https://example.com/posts/${id}`,
        fetchPublicPost: async () => { rendered += 1; return post; },
      },
    },
  });
  for (const url of [`/posts/${postId}`, `/posts/${postId}?id=${postId}`, `/api/post?id=${postId}`]) {
    const res = createApiResponseRecorder();
    await handler({ method: "GET", url, query: { id: postId } }, res);
    assert.equal(res.statusCode, 200, `canonical/rewrite requests must render instead of redirecting to themselves: ${url}`);
    assert.equal(res.getHeader("location"), undefined);
    assert.match(res.textBody, /Article SSR sentinel/);
    assert.match(res.textBody, new RegExp(`rel="canonical" href="https://example.com/posts/${postId}"`));
  }
  assert.equal(rendered, 3);
  for (const suffix of ["?tracking=1", `?id=${postId}&tracking=1`, `?id=${postId}&id=${postId}`, "?id=wrong", "?"]) {
    const res = createApiResponseRecorder();
    await handler({ method: "GET", url: `/posts/${postId}${suffix}`, query: { id: postId } }, res);
    assert.equal(res.statusCode, 308);
    assert.equal(res.getHeader("location"), `/posts/${postId}`);
    assert.match(res.getHeader("cache-control"), /max-age=0/);
  }
  assert.equal(rendered, 3, "invalid query variants should redirect before loading content");
}

function checkConfiguredHomeLink() {
  let pageModule;
  const cta = new FakeElement();
  cta.setAttribute("href", "/blog.html?category=Custom%20Featured");
  const elements = { heroSearchForm: new FakeElement(), heroSearch: new FakeElement(), ctaHome: new FakeElement(), ctaStart: cta, ctaWiki: new FakeElement() };
  loadBrowserScript("js/index-page.js", {
    window: {
      location: new URL("https://example.com/"),
      NotionContentShared: loadCommonJsModule("js/notion-content-shared.js"),
      PageRuntime: { register(_id, value) { pageModule = value; } },
    },
    document: { getElementById: (id) => elements[id] || null },
  });
  const cleanup = pageModule.init();
  assert.equal(new URL(cta.href, "https://example.com").searchParams.get("category"), "Custom Featured");
  assert.equal(cta.getAttribute("aria-label"), "Custom Featured");
  cleanup?.();
}

async function checkRouterPageComposition() {
  const browser = createContentBrowser();
  for (const routePath of ["/blog.html?category=Tech", "/blog.html#bookmarks"]) {
    const seoUpdates = [];
    const elements = Object.fromEntries(["blogFilters", "blogSearch", "blogGrid", "emptyState", "pagination", "blogStatus", "topActions"].map((key) => [key, new FakeElement()]));
    const pageTitle = new FakeElement();
    let cleanup;
    const updateSeoMeta = (value) => seoUpdates.push(value);
    const routeDocument = createRouteDocument();
    routeDocument.title = "总览 — Integration";
    const route = createSpaRouterHarness((file, options) => loadBrowserScript(file, {
      ...options, window: { ...options.window, updateSeoMeta },
    }), {
      routeDocument,
      fetch: async () => createJsonResponse("<html></html>"),
      initializePage() {
        let pageModule;
        loadBrowserScript("js/blog-page.js", {
          window: {
            NotionContentShared: browser.NotionContentShared,
            NotionContentUrl: browser.NotionContentUrl,
            NotionContentUtils: browser.NotionContentUtils,
            location: route.location,
            history: route.harness.window.history,
            SiteUtils: { ...browser.SiteUtils, getSiteName: () => "Integration" },
            NotionAPI: { ...browser.NotionAPI, queryPosts: async ({ page = 1 }) => ({ results: [], currentPage: page, total: 18, totalPages: 2 }) },
            PageRuntime: { register(_id, value) { pageModule = value; } },
            updateSeoMeta, scrollTo() {},
          },
          document: {
            getElementById: (id) => elements[id] || null,
            querySelector: (selector) => selector === ".page-title" ? pageTitle : null,
          },
        });
        cleanup = pageModule.init();
      },
    });
    await route.harness.window.SPARouter.navigate(`https://example.com${routePath}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const isBookmark = routePath.includes("#bookmarks");
    assert.equal(seoUpdates.at(-1).title, `${isBookmark ? "收藏" : "Tech"} — Integration`);
    assert.equal(seoUpdates.at(-1).robots, isBookmark ? "noindex, nofollow" : null);
    assert.equal(pageTitle.textContent, isBookmark ? "收藏" : "Tech");
    if (!isBookmark) {
      const nextPage = new FakeElement();
      nextPage.dataset.page = "2";
      elements.pagination.appendChild(nextPage);
      elements.pagination.dispatch("click", { target: { closest: () => nextPage } });
      assert.equal(new URL(seoUpdates.at(-1).canonicalUrl).searchParams.get("page"), "2");
    }
    cleanup?.();
  }
}

async function checkArticleTransportRecovery() {
  const browser = createContentBrowser();
  const calls = [];
  const route = createSpaRouterHarness((file, options) => loadBrowserScript(file, {
    ...options,
    window: {
      ...options.window,
      SiteUtils: browser.SiteUtils,
      PageRuntime: { ...options.window.PageRuntime, getPageIdFromUrl: () => "post" },
    },
  }), {
    fetch: async (url) => {
      calls.push(String(url));
      if (calls.length === 1) throw new TypeError("Failed to fetch: redirect loop");
      return createJsonResponse("<html></html>");
    },
  });
  await route.harness.window.SPARouter.navigate(`https://example.com/posts/${postId}`);
  assert.deepEqual(calls, [`https://example.com/posts/${postId}`, `https://example.com/api/post?id=${postId}`]);
  assert.equal(route.location.pathname, `/posts/${postId}`, "transport recovery must retain the public address");
  assert.equal(route.feedbackEvents.some((event) => event.type === "show"), false);
}

async function checkSlowArticleResponse() {
  const browser = createContentBrowser();
  const deadlines = new Map();
  let resolveHtml;
  let requestSignal;
  const clearTimer = (id) => {
    if (!deadlines.delete(id)) clearTimeout(id);
  };
  const route = createSpaRouterHarness((file, options) => loadBrowserScript(file, {
    ...options,
    window: {
      ...options.window,
      clearTimeout: clearTimer,
      SiteUtils: browser.SiteUtils,
      PageRuntime: { ...options.window.PageRuntime, getPageIdFromUrl: () => "post" },
    },
    globals: { ...options.globals, clearTimeout: clearTimer },
  }), {
    fetch: (_url, { signal }) => {
      requestSignal = signal;
      return new Promise((resolve) => { resolveHtml = resolve; });
    },
    setTimeout(callback, delay) {
      if (delay >= 10_000) {
        const id = Symbol("virtual deadline");
        deadlines.set(id, { callback, delay });
        return id;
      }
      return setTimeout(callback, 0);
    },
  });
  const navigation = route.harness.window.SPARouter.navigate(`https://example.com/posts/${postId}`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(typeof resolveHtml, "function");
  // Advance just past the old 15s deadline while the server is still inside
  // its supported 30s operation budget. No wall-clock delay is needed.
  for (const { callback, delay } of deadlines.values()) {
    if (delay <= 16_000) callback();
  }
  await Promise.resolve();
  assert.equal(requestSignal.aborted, false, "a valid 16 second article response must not be cancelled");
  resolveHtml(createJsonResponse("<html></html>"));
  await navigation;
  assert.equal(route.location.pathname, `/posts/${postId}`);
  assert.equal(route.feedbackEvents.some((event) => event.type === "show"), false);
  assert.equal(deadlines.size, 0, "a completed navigation must clear its deadlines");
}

async function checkBootstrapDiagnostics() {
  for (const response of [
    { status: 503, payload: { code: "notion_config_error", detail: "Missing configuration" } },
    { status: 429, payload: { notionCode: "rate_limited", message: "Slow down" }, retryAfter: "12" },
    { status: 502, invalidJson: true },
  ]) {
    const bootstrap = loadBrowserScript("js/blog-bootstrap.js", {
      window: { location: new URL("https://example.com/blog.html") },
      document: { body: { dataset: { page: "" } } },
      fetch: async () => ({
        ok: false,
        status: response.status,
        headers: { get: () => response.retryAfter || "" },
        json: async () => {
          if (response.invalidJson) throw new SyntaxError("Invalid JSON");
          return response.payload;
        },
      }),
    });
    const entry = bootstrap.window.BlogBootstrap.ensure();
    await assert.rejects(entry.promise, (error) => {
      assert.equal(error.status, response.status);
      assert.equal(error.code, response.payload?.code);
      assert.equal(error.notionCode, response.payload?.notionCode);
      assert.equal(error.retryAfter, response.retryAfter || "");
      if (response.payload) assert.equal(error.detail, response.payload.detail || response.payload.message);
      return true;
    });
  }
}

export async function runIntegrationRegressionChecks() {
  await checkBookmarkModuleComposition();
  await checkCategoryIdentifiers();
  checkTablesAndPublicPolicy();
  await checkRewrittenArticleRoutes();
  checkConfiguredHomeLink();
  await checkRouterPageComposition();
  await checkArticleTransportRecovery();
  await checkSlowArticleResponse();
  await checkBootstrapDiagnostics();
}
