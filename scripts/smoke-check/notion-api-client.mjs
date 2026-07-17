export async function runNotionApiClientChecks(context) {
  const {
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
  } = context;

const listingContentGlobals = Object.freeze({
  NotionContentShared: notionContentSharedHelpers,
  NotionContentUrl: notionContentUrlHelpers,
  NotionContentUtils: notionContentUtilsHelpers,
  SiteUtils: siteUtilsHarness.window.SiteUtils,
});
const buildTestPostId = (value) => Number(value).toString(16).padStart(32, "0");
const sessionPostId = "550e8400e29b41d4a716446655440000";
const hyphenatedSessionPostId = "550e8400-e29b-41d4-a716-446655440000";

const staleSessionSummaryKey = "notion_post_summary_stale";
const quotaSessionStorage = createQuotaLimitedStorageMock({
  initialEntries: {
    [staleSessionSummaryKey]: JSON.stringify({
      timestamp: Date.now() - 1000 * 60 * 60,
      data: {
        id: buildTestPostId(9_001),
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
    ...listingContentGlobals,
  },
  sessionStorage: quotaSessionStorage,
  fetch: async (url) => {
    notionApiFetchCount += 1;
    assert.equal(
      String(url),
      `/api/post-data?id=${sessionPostId}`,
      "notion client should request the semantic post data endpoint with a canonical post id",
    );

    return createJsonResponse({
      id: hyphenatedSessionPostId,
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
assert.throws(
  () => notionApiHarness.window.NotionAPI.renderBlocks([]),
  /notion-content\.js must load/,
  "notion client listing APIs should initialize without the full article renderer",
);
notionApiHarness.window.NotionContent = notionContentHelpers;
assert.equal(
  notionApiHarness.window.NotionAPI.renderBlocks([]),
  "",
  "notion client should preserve its renderBlocks API once the article module is loaded on demand",
);
const notionApiFetchedPost = await notionApiHarness.window.NotionAPI.getPost(hyphenatedSessionPostId.toUpperCase());
assert.equal(
  notionApiFetchCount,
  1,
  "notion client should issue exactly one network request for the uncached post detail",
);
await assert.rejects(
  notionApiHarness.window.NotionAPI.getPost("not-a-public-post-id"),
  (error) => error?.status === 400 && error?.code === "invalid_post_id",
  "notion client should reject invalid post ids before starting a request",
);
assert.equal(notionApiFetchCount, 1, "invalid post ids should not reach the post data endpoint");
assert.equal(
  notionApiFetchedPost.id,
  sessionPostId,
  "notion client should return the canonical id after fetching an equivalent hyphenated route",
);
const storedSessionSummaryRaw = quotaSessionStorage.getItem(`notion_post_summary_${sessionPostId}`);
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
    ...listingContentGlobals,
  },
  sessionStorage: quotaSessionStorage,
  fetch: async () => {
    throw new Error("Unexpected network request while reading a persisted post summary");
  },
});
const restoredSessionSummary = notionApiSessionReloadHarness.window.NotionAPI.getPostSummary(hyphenatedSessionPostId);
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
    ...listingContentGlobals,
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
        id: buildTestPostId(index + 1),
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
  summaryLruHarness.window.NotionAPI.getPostSummary(buildTestPostId(1)),
  null,
  "notion client should evict the oldest summary when the in-memory LRU exceeds its limit",
);
assert.equal(
  summaryLruHarness.window.NotionAPI.getPostSummary(buildTestPostId(2))?.title,
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
    data: { id: buildTestPostId(9_002), title: "Expired summary" },
  }),
  [throttledFreshSummaryKey]: JSON.stringify({
    timestamp: throttledSessionNow - 1000,
    data: { id: buildTestPostId(9_003), title: "Fresh summary" },
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
    ...listingContentGlobals,
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
        id: buildTestPostId(1_000 + (throttledFetchCount * 10) + index),
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
    ...listingContentGlobals,
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

let sharedRequestSignal = null;
let sharedRequestFetchCount = 0;
const sharedRequestPostId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const sharedRequestHarness = loadBrowserScript("js/notion-api.js", {
  window: {
    location: new URL("https://example.com/post.html"),
    ...listingContentGlobals,
  },
  fetch: async (url, init) => {
    sharedRequestFetchCount += 1;
    assert.equal(String(url), `/api/post-data?id=${sharedRequestPostId}`);
    sharedRequestSignal = init.signal;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  },
});
const firstConsumerController = new AbortController();
const secondConsumerController = new AbortController();
const firstConsumer = sharedRequestHarness.window.NotionAPI.getPost(
  "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA",
  { signal: firstConsumerController.signal },
);
const secondConsumer = sharedRequestHarness.window.NotionAPI.getPost(
  sharedRequestPostId,
  { signal: secondConsumerController.signal },
);
await Promise.resolve();
await Promise.resolve();
assert.equal(
  sharedRequestFetchCount,
  1,
  "equivalent post id spellings should share one canonical in-flight request",
);
firstConsumerController.abort();
await assert.rejects(firstConsumer, (error) => error?.name === "AbortError");
assert.equal(
  sharedRequestSignal?.aborted,
  false,
  "aborting one shared-request consumer should not cancel work still needed by another consumer",
);
secondConsumerController.abort();
await assert.rejects(secondConsumer, (error) => error?.name === "AbortError");
assert.equal(
  sharedRequestSignal?.aborted,
  true,
  "aborting the final shared-request consumer should cancel the underlying request",
);

const callerAbortHarness = loadBrowserScript("js/notion-api.js", {
  window: {
    location: new URL("https://example.com/post.html"),
    ...listingContentGlobals,
  },
  fetch: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => {
      const error = new Error("caller aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  }),
});
const callerController = new AbortController();
const callerRequest = callerAbortHarness.window.NotionAPI.getPost(
  "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  { signal: callerController.signal },
);
await Promise.resolve();
callerController.abort();
await assert.rejects(
  callerRequest,
  (error) => error?.name === "AbortError" && !error?.status,
  "caller cancellation should remain an AbortError instead of looking like a gateway timeout",
);

const timeoutHarness = loadBrowserScript("js/notion-api.js", {
  window: {
    location: new URL("https://example.com/post.html"),
    ...listingContentGlobals,
  },
  globals: {
    setTimeout(callback) {
      queueMicrotask(callback);
      return 1;
    },
    clearTimeout() {},
  },
  fetch: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => {
      const error = new Error("internal timeout");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  }),
});
await assert.rejects(
  timeoutHarness.window.NotionAPI.getPost("cccccccccccccccccccccccccccccccc"),
  (error) => error?.status === 504 && error?.name !== "AbortError",
  "the internal request deadline should surface a distinct 504 error",
);

let bootstrapFetchCount = 0;
const bootstrapPayload = {
  results: [{ id: buildTestPostId(2_000), title: "Bootstrap post", excerpt: "", tags: [] }],
  categories: [],
  total: 1,
  totalPages: 1,
  currentPage: 1,
};
const bootstrapEntry = {
  requestUrl: "https://example.com/api/posts-data?search=bootstrap",
  consumed: false,
  controller: new AbortController(),
  promise: Promise.resolve(bootstrapPayload),
};
const bootstrapHarness = loadBrowserScript("js/notion-api.js", {
  window: {
    location: new URL("https://example.com/blog.html?search=bootstrap"),
    ...listingContentGlobals,
    PageBootstrap: { blogInitialData: bootstrapEntry },
  },
  fetch: async () => {
    bootstrapFetchCount += 1;
    return createJsonResponse({ ...bootstrapPayload, results: [] });
  },
});
const bootstrappedResult = await bootstrapHarness.window.NotionAPI.queryPosts({ search: "bootstrap" });
assert.equal(bootstrapFetchCount, 0, "a complete matching bootstrap URL should satisfy the first listing read without another fetch");
assert.equal(bootstrapEntry.consumed, true, "matching blog bootstrap data should be consumed exactly once");
assert.equal(bootstrappedResult.results[0]?.id, buildTestPostId(2_000), "the first listing read should return bootstrap payload data");
await bootstrapHarness.window.NotionAPI.queryPosts({ search: "bootstrap" });
assert.equal(bootstrapFetchCount, 0, "subsequent identical listing reads should use the notion client response cache");
await bootstrapHarness.window.NotionAPI.queryPosts({ search: "different" });
assert.equal(bootstrapFetchCount, 1, "a different complete request URL should bypass consumed bootstrap data and use fetch");

const cancelledBootstrapController = new AbortController();
const cancelledBootstrapEntry = {
  requestUrl: "/api/posts-data?search=cancelled-bootstrap",
  startedAt: Date.now(),
  consumed: false,
  controller: cancelledBootstrapController,
  promise: new Promise(() => {}),
};
const cancelledBootstrapHarness = loadBrowserScript("js/notion-api.js", {
  window: {
    location: new URL("https://example.com/blog.html"),
    ...listingContentGlobals,
    PageBootstrap: { blogInitialData: cancelledBootstrapEntry },
  },
  fetch: async () => {
    throw new Error("a matching pending bootstrap request should not be refetched");
  },
});
const cancelledBootstrapCaller = new AbortController();
const cancelledBootstrapRequest = cancelledBootstrapHarness.window.NotionAPI.queryPosts(
  { search: "cancelled-bootstrap" },
  { signal: cancelledBootstrapCaller.signal },
);
await Promise.resolve();
await Promise.resolve();
cancelledBootstrapCaller.abort();
await assert.rejects(
  cancelledBootstrapRequest,
  (error) => error?.name === "AbortError" && !error?.status,
  "caller cancellation while awaiting matching bootstrap data should remain an AbortError",
);
assert.equal(
  cancelledBootstrapController.signal.aborted,
  true,
  "cancelling the final bootstrap consumer should abort the bootstrap fetch controller",
);

let bootstrapClock = 1_000_000;
let nextBootstrapTimerId = 1;
const bootstrapTimers = new Map();
class BootstrapClockDate extends Date {
  static now() {
    return bootstrapClock;
  }
}
function setBootstrapTimer(callback, delay = 0) {
  const id = nextBootstrapTimerId;
  nextBootstrapTimerId += 1;
  bootstrapTimers.set(id, { callback, at: bootstrapClock + Number(delay || 0) });
  return id;
}
function clearBootstrapTimer(id) {
  bootstrapTimers.delete(id);
}
function advanceBootstrapClock(ms) {
  bootstrapClock += ms;
  const dueTimers = [...bootstrapTimers.entries()]
    .filter(([, timer]) => timer.at <= bootstrapClock)
    .sort((left, right) => left[1].at - right[1].at);
  dueTimers.forEach(([id, timer]) => {
    bootstrapTimers.delete(id);
    timer.callback();
  });
}
const expiringBootstrapController = new AbortController();
const expiringBootstrapHarness = loadBrowserScript("js/notion-api.js", {
  window: {
    location: new URL("https://example.com/blog.html"),
    ...listingContentGlobals,
    PageBootstrap: {
      blogInitialData: {
        requestUrl: "/api/posts-data",
        startedAt: bootstrapClock - 34_990,
        consumed: false,
        controller: expiringBootstrapController,
        promise: new Promise(() => {}),
      },
    },
  },
  globals: {
    Date: BootstrapClockDate,
    setTimeout: setBootstrapTimer,
    clearTimeout: clearBootstrapTimer,
  },
  fetch: async () => {
    throw new Error("matching bootstrap data should be awaited instead of refetched");
  },
});
const expiringBootstrapRequest = expiringBootstrapHarness.window.NotionAPI.queryPosts({});
await Promise.resolve();
await Promise.resolve();
advanceBootstrapClock(10);
await assert.rejects(
  expiringBootstrapRequest,
  (error) => error?.status === 504 && error?.name !== "AbortError",
  "bootstrap time should count against the same 35 second client deadline",
);
assert.equal(
  expiringBootstrapController.signal.aborted,
  true,
  "an expired bootstrap request should abort its underlying fetch controller",
);

}
