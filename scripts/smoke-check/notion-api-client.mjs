export async function runNotionApiClientChecks(context) {
  const {
    assert,
    createJsonResponse,
    createQuotaLimitedStorageMock,
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
  restoredSessionSummary?._searchText?.includes("alpha"),
  "notion client should rebuild derived search text when reading a compacted summary back from sessionStorage",
);
const memoryOnlySummaryStorage = createQuotaLimitedStorageMock({ maxChars: 0 });
let summaryLruFetchCount = 0;
const summaryLruHarness = loadBrowserScript("js/notion-api.js", {
  window: {
    location: new URL("https://example.com/blog.html"),
    NotionContent: notionContentHelpers,
  },
  sessionStorage: memoryOnlySummaryStorage,
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

}
