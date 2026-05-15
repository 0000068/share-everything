export async function runNotionApiClientChecks(context) {
  const {
    assert,
    createJsonResponse,
    createQuotaLimitedStorageMock,
    createStorageMock,
    ephemeralCoverImage,
    loadBrowserScript,
    notionContentHelpers,
  } = context;

const staleSessionSummaryKey = "notion_post_summary_stale";
const quotaSessionStorage = createQuotaLimitedStorageMock({
  initialEntries: {
    [staleSessionSummaryKey]: JSON.stringify({
      timestamp: Date.now() - 1000 * 60 * 60,
      data: {
        id: "stale-post",
        title: "Stale post",
        excerpt: "x".repeat(240),
      },
    }),
  },
  maxChars: 760,
});
let notionApiFetchCount = 0;
const notionApiHarness = loadBrowserScript("js/notion-api.js", {
  window: {
    location: new URL("https://example.com/blog.html"),
    NotionContent: notionContentHelpers,
  },
  sessionStorage: quotaSessionStorage,
  fetch: async (url) => {
    notionApiFetchCount += 1;
    assert.equal(
      String(url),
      "/api/post-data?id=session-post-1",
      "notion client should request the semantic post data endpoint for detail fetches",
    );

    return createJsonResponse({
      id: "session-post-1",
      title: "Session cached title",
      excerpt: "Session cached excerpt",
      category: "Tech",
      date: "2026-04-17",
      readTime: "5 min",
      coverImage: `${ephemeralCoverImage}&padding=${"x".repeat(360)}`,
      coverEmoji: "馃И",
      coverGradient: "linear-gradient(135deg, #111111, #222222)",
      tags: ["Alpha", "Beta", "Gamma"],
      content: [],
    });
  },
});
const notionApiFetchedPost = await notionApiHarness.window.NotionAPI.getPost("session-post-1");
assert.equal(
  notionApiFetchCount,
  1,
  "notion client should issue exactly one network request for the uncached post detail",
);
assert.equal(
  notionApiFetchedPost.id,
  "session-post-1",
  "notion client should still return the fetched post payload after compacting the summary cache entry",
);
const storedSessionSummaryRaw = quotaSessionStorage.getItem("notion_post_summary_session-post-1");
assert.ok(
  storedSessionSummaryRaw,
  "notion client should persist a compacted post summary entry even when sessionStorage quota is tight",
);
const storedSessionSummary = JSON.parse(storedSessionSummaryRaw);
assert.equal(
  storedSessionSummary.data.coverImage,
  null,
  "notion client should drop session cover URLs when they are likely ephemeral or overly large",
);
assert.ok(
  !Object.prototype.hasOwnProperty.call(storedSessionSummary.data, "_searchText"),
  "notion client should avoid storing derived search text in the persisted session summary payload",
);
assert.equal(
  quotaSessionStorage.getItem(staleSessionSummaryKey),
  null,
  "notion client should clear expired session summary entries before evicting fresher data under quota pressure",
);
const notionApiSessionReloadHarness = loadBrowserScript("js/notion-api.js", {
  window: {
    location: new URL("https://example.com/blog.html"),
    NotionContent: notionContentHelpers,
  },
  sessionStorage: quotaSessionStorage,
  fetch: async () => {
    throw new Error("Unexpected network request while reading a persisted post summary");
  },
});
const restoredSessionSummary = notionApiSessionReloadHarness.window.NotionAPI.getPostSummary("session-post-1");
assert.equal(
  restoredSessionSummary?.title,
  "Session cached title",
  "notion client should restore compacted session summaries without re-fetching the post detail",
);
assert.ok(
  !Object.prototype.hasOwnProperty.call(restoredSessionSummary, "_searchText"),
  "notion client should not reintroduce derived search text when restoring compacted session summaries",
);
const memoryOnlySummaryStorage = createQuotaLimitedStorageMock({ maxChars: 0 });
let summaryLruFetchCount = 0;
const summaryLruDebugEvents = [];
const summaryLruHarness = loadBrowserScript("js/notion-api.js", {
  window: {
    location: new URL("https://example.com/blog.html"),
    NotionContent: notionContentHelpers,
  },
  sessionStorage: memoryOnlySummaryStorage,
  globals: {
    console: {
      ...console,
      debug(message, ...args) {
        summaryLruDebugEvents.push([message, ...args]);
      },
    },
  },
  fetch: async (url) => {
    summaryLruFetchCount += 1;
    assert.equal(
      String(url),
      "/api/posts-data",
      "notion client should request the unfiltered post list endpoint for summary LRU priming",
    );

    return createJsonResponse({
      results: Array.from({ length: 201 }, (_, index) => ({
        id: `lru-post-${index}`,
        title: `LRU post ${index}`,
        excerpt: "",
        tags: [],
      })),
      categories: [
        { name: "全部", label: "全部", emoji: "📋" },
        {
          name: "AI",
          label: "AI Lab",
          emoji: "🤖",
          categoryColor: { bg: "rgba(41, 121, 255, 0.1)", color: "#2979ff", border: "rgba(41, 121, 255, 0.2)" },
          coverGradient: "linear-gradient(135deg, #0d1b4b, #1a3a6b)",
        },
      ],
      total: 201,
      totalPages: 1,
      currentPage: 1,
    });
  },
});
await summaryLruHarness.window.NotionAPI.queryPosts({});
assert.equal(
  summaryLruFetchCount,
  1,
  "notion client should prime the summary LRU from one listing request",
);
assert.ok(
  summaryLruDebugEvents.some(([message, error]) => (
    message === "Failed to persist Notion session cache:" &&
    error?.name === "QuotaExceededError"
  )),
  "notion client should debug-log session cache quota failures without hiding their cause",
);
assert.equal(
  summaryLruHarness.window.NotionAPI.getPostSummary("lru-post-0"),
  null,
  "notion client should evict the oldest summary when the in-memory LRU exceeds its limit",
);
assert.equal(
  summaryLruHarness.window.NotionAPI.getPostSummary("lru-post-1")?.title,
  "LRU post 1",
  "notion client should retain recent summaries inside the bounded in-memory LRU",
);
assert.deepEqual(
  summaryLruHarness.window.NotionAPI.getCategories().map((category) => category.label),
  ["全部", "AI Lab"],
  "notion client should replace hardcoded category navigation with the API-provided category list",
);
assert.equal(
  summaryLruHarness.window.NotionAPI.getCategoryColor("AI").color,
  "#2979ff",
  "notion client should use API-provided category colors for cards",
);

let throttledSessionNow = 10_000_000;
class ThrottledSessionDate extends Date {
  static now() {
    return throttledSessionNow;
  }
}
const throttledStaleSummaryKey = "notion_post_summary_throttled_stale";
const throttledFreshSummaryKey = "notion_post_summary_throttled_fresh";
const throttledBaseStorage = createStorageMock({
  [throttledStaleSummaryKey]: JSON.stringify({
    timestamp: throttledSessionNow - 1000 * 60 * 31,
    data: { id: "throttled-stale", title: "Expired summary" },
  }),
  [throttledFreshSummaryKey]: JSON.stringify({
    timestamp: throttledSessionNow - 1000,
    data: { id: "throttled-fresh", title: "Fresh summary" },
  }),
});
let throttledSessionKeyReads = 0;
const throttledSessionStorage = {
  getItem(key) {
    return throttledBaseStorage.getItem(key);
  },
  setItem(key, value) {
    throttledBaseStorage.setItem(key, value);
  },
  removeItem(key) {
    throttledBaseStorage.removeItem(key);
  },
  clear() {
    throttledBaseStorage.clear();
  },
  key(index) {
    throttledSessionKeyReads += 1;
    return throttledBaseStorage.key(index);
  },
  get length() {
    return throttledBaseStorage.length;
  },
};
let throttledFetchCount = 0;
const throttledSummaryHarness = loadBrowserScript("js/notion-api.js", {
  window: {
    location: new URL("https://example.com/blog.html"),
    NotionContent: notionContentHelpers,
  },
  sessionStorage: throttledSessionStorage,
  globals: {
    Date: ThrottledSessionDate,
  },
  fetch: async () => {
    throttledFetchCount += 1;
    const resultCount = throttledFetchCount === 1 ? 3 : 1;
    return createJsonResponse({
      results: Array.from({ length: resultCount }, (_, index) => ({
        id: `throttled-${throttledFetchCount}-${index}`,
        title: `Throttled summary ${throttledFetchCount}-${index}`,
        excerpt: "",
        tags: [],
      })),
      categories: [],
      total: resultCount,
      totalPages: 1,
      currentPage: 1,
    });
  },
});
await throttledSummaryHarness.window.NotionAPI.queryPosts({ search: "first" });
const firstSweepKeyReads = throttledSessionKeyReads;
assert.equal(
  throttledBaseStorage.getItem(throttledStaleSummaryKey),
  null,
  "notion client should still clear expired session summaries on the first throttled sweep",
);
assert.equal(
  firstSweepKeyReads,
  2,
  "notion client should inspect sessionStorage once while priming multiple summaries in the same tick",
);
await throttledSummaryHarness.window.NotionAPI.queryPosts({ search: "second" });
assert.equal(
  throttledSessionKeyReads,
  firstSweepKeyReads,
  "notion client should throttle repeated sessionStorage sweeps inside the 30 second window",
);
throttledSessionNow += 30_000;
await throttledSummaryHarness.window.NotionAPI.queryPosts({ search: "third" });
assert.ok(
  throttledSessionKeyReads > firstSweepKeyReads,
  "notion client should allow another sessionStorage sweep once the throttle window elapses",
);

let rateLimitError = null;
const rateLimitHarness = loadBrowserScript("js/notion-api.js", {
  window: {
    location: new URL("https://example.com/blog.html"),
    NotionContent: notionContentHelpers,
  },
  fetch: async () => createJsonResponse({
    error: "Rate limited",
    notionCode: "rate_limited",
  }, {
    status: 429,
    headers: {
      "Retry-After": "30",
    },
  }),
});
try {
  await rateLimitHarness.window.NotionAPI.queryPosts({});
} catch (error) {
  rateLimitError = error;
}
assert.equal(
  rateLimitError?.retryAfter,
  "30",
  "notion client should expose Retry-After seconds on rate-limit errors",
);

}
