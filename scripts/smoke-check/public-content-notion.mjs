export async function runPublicContentAndNotionChecks(context) {
  const {
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
  } = context;

expectIncludes(publicContentJs, "getPublicPostErrorStatus", "public content helper should centralize post error mapping");
expectNotIncludes(publicContentJs, "notion_public_config_error", "public content helper should not keep field-based public access errors in database-wide public mode");
expectNotIncludes(blogPageJs, "公开字段或发布状态", "blog frontend should not suggest field-based public publishing in database-wide public mode");
expectNotIncludes(readmeMd, "发布状态改为", "README should not describe status-field publishing in database-wide public mode");
expectIncludes(publicContentJs, "notion_timeout_error", "public content helper should preserve upstream timeout status");
expectIncludes(publicContentJs, "Retry-After", "public content helper should preserve retry guidance for upstream rate limits");
expectIncludes(publicContentJs, "restricted_resource", "public content helper should classify upstream Notion permission failures as server-side integration faults");
expectIncludes(publicContentJs, "object_not_found", "public content helper should classify missing upstream Notion objects as configuration faults");
expectIncludes(publicContentJs, "resourceType", "public content helper should distinguish database and page Notion errors");
assert.equal(
  publicContentHelpers.getPublicContentErrorStatus({
    status: 429,
    notionCode: "rate_limited",
  }),
  429,
  "public content helper should preserve Notion rate-limit responses as HTTP 429",
);
assert.equal(
  publicContentHelpers.getPublicContentErrorStatus({
    status: 404,
    code: "public_page_out_of_range",
  }),
  404,
  "post-list pages beyond the canonical range should stay a client-visible 404",
);
assert.equal(
  publicContentHelpers.getPublicContentErrorStatus({
    status: 401,
    notionCode: "unauthorized",
  }),
  500,
  "public content helper should treat upstream auth failures as a stable server-side configuration error",
);
assert.equal(
  publicContentHelpers.getPublicContentErrorStatus({
    status: 403,
    notionCode: "restricted_resource",
  }),
  500,
  "public content helper should treat upstream permission failures as a stable server-side configuration error",
);
assert.equal(
  publicContentHelpers.getPublicContentErrorStatus({
    status: 404,
    notionCode: "object_not_found",
  }),
  500,
  "public content helper should treat missing upstream Notion objects as a stable server-side configuration error",
);
assert.equal(
  publicContentHelpers.getPublicPostErrorStatus({
    status: 404,
    notionCode: "object_not_found",
    resourceType: "database",
    detail: "Could not find database with ID: test-database",
  }),
  500,
  "public post helper should treat missing database metadata as a server-side configuration error",
);
assert.equal(
  publicContentHelpers.getPublicPostErrorStatus({
    status: 400,
    notionCode: "validation_error",
    resourceType: "database",
    detail: "path failed validation: path.database_id should be a valid uuid",
  }),
  500,
  "public post helper should treat invalid database ids as server-side configuration errors",
);
assert.equal(
  publicContentHelpers.getPublicPostErrorStatus({
    status: 404,
    notionCode: "object_not_found",
    resourceType: "page",
    detail: "Could not find page with ID: missing-post",
  }),
  404,
  "public post helper should keep missing Notion pages as article-not-found responses",
);
assert.equal(
  publicContentHelpers.getPublicPostErrorStatus({
    status: 400,
    notionCode: "validation_error",
    resourceType: "page",
  }),
  404,
  "public post helper should keep invalid route page ids as article-not-found responses",
);
assert.equal(
  publicContentHelpers.readPositiveInteger("2abc", 1),
  1,
  "public content helper should reject partially numeric page query strings",
);
assert.equal(
  publicContentHelpers.readPositiveInteger("02", 1),
  2,
  "public content helper should still accept canonicalizable numeric page query strings",
);
assert.equal(
  publicContentHelpers.readPublicPostId("550e8400-e29b-41d4-a716-446655440000"),
  "550e8400e29b41d4a716446655440000",
  "public content helper should collapse UUID route ids to the unique compact lowercase form",
);
assert.equal(
  publicContentHelpers.readPublicPostId("550e8400e29b41d4a716446655440000"),
  "550e8400e29b41d4a716446655440000",
  "public content helper should accept compact Notion page ids",
);
assert.equal(
  publicContentHelpers.readPublicPostId(["550e8400e29b41d4a716446655440000"]),
  "",
  "public content helper should reject duplicate/array-valued post ids instead of selecting one",
);
assert.equal(
  new URL(serverNotionHelpers.buildPostUrl("550E8400-E29B-41D4-A716-446655440000")).pathname,
  "/posts/550e8400e29b41d4a716446655440000",
  "server-generated canonical article URLs should use the unique compact lowercase id",
);
assert.equal(
  publicContentHelpers.readPublicPostId("unsafe/post?debug=1"),
  "",
  "public content helper should reject path-like public post route ids before Notion requests",
);
const publicErrorHeaders = [];
publicContentHelpers.applyPublicErrorHeaders({
  setHeader(name, value) {
    publicErrorHeaders.push([name, value]);
  },
}, {
  retryAfter: "30",
});
assert.equal(
  JSON.stringify(publicErrorHeaders),
  JSON.stringify([
    ["Content-Type", "application/json; charset=utf-8"],
    ["Cache-Control", "no-store"],
    ["Retry-After", "30"],
  ]),
  "public content helper should mark JSON errors explicitly, keep them non-cacheable, and forward Retry-After",
);
const serverErrorLogs = [];
const originalConsoleError = console.error;
console.error = (...args) => {
  serverErrorLogs.push(args);
};
try {
  publicContentHelpers.logServerError("Public route failed", {
    message: "Upstream failed",
    status: 429,
    code: "notion_request_error",
    notionCode: "rate_limited",
    stack: "internal stack should stay out of logs",
  });
} finally {
  console.error = originalConsoleError;
}
assert.equal(
  JSON.stringify(serverErrorLogs),
  JSON.stringify([[
    "Public route failed:",
    {
      message: "Upstream failed",
      status: 429,
      code: "notion_request_error",
      notionCode: "rate_limited",
    },
  ]]),
  "public content helper should log only sanitized server error fields",
);
const sanitizedPublicError = publicContentHelpers.serializePublicError({
  code: "notion_config_error",
  notionCode: "object_not_found",
  detail: "Could not find database with ID: secret-database-id",
}, "Post list unavailable");
assert.equal(
  Object.prototype.hasOwnProperty.call(sanitizedPublicError, "detail"),
  false,
  "public content helper should not expose upstream error details by default",
);
expectIncludes(serverPostServiceJs, "queryPublicPages", "post service should expose a filtered public page query helper");
expectIncludes(serverPostServiceJs, "queryPublicPosts", "post service should provide a public post query helper");
expectIncludes(serverNotionClientJs, "getNotionResourceType", "notion client should annotate upstream errors with the Notion resource type");
expectIncludes(serverPostServiceJs, "PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS", "post service should define a short-lived public summary cache");
expectIncludes(serverNotionSchemaJs, "buildContentSchema", "schema service should derive content property mappings from database metadata");
expectIncludes(serverNotionSchemaJs, "buildDatabaseSorts", "schema service should derive list sorting from the resolved schema");
expectIncludes(serverPostServiceJs, "normalizePostQueryFilters", "post service should normalize category and search inputs before querying");
expectIncludes(serverPostServiceJs, "PUBLIC_SEARCH_QUERY_MAX_LENGTH", "post service should cap public search query input length");
expectIncludes(serverNotionClientJs, "normalizeSiteOrigin", "notion client should validate SITE_URL before generating public URLs");
expectIncludes(serverPostServiceJs, "parseNotionPaginationResponse(data", "post service should fail closed on malformed Notion list pagination payloads");
expectIncludes(serverBlockServiceJs, "parseNotionPaginationResponse(data", "block service should fail closed on malformed Notion block pagination payloads");
expectIncludes(serverPostServiceJs, "seenCursors.has(nextCursor)", "post service should reject repeated Notion database cursors");
expectIncludes(serverBlockServiceJs, "seenCursors.has(nextCursor)", "block service should reject repeated Notion block cursors");
expectIncludes(serverPostServiceJs, "{ signal: operation?.signal }", "shared Notion metadata/list work should observe caller cancellation");
expectIncludes(serverPostServiceJs, "includeSearchText: true", "post service should precompute public post search text when mapping Notion pages");
expectIncludes(serverPostServiceJs, "hasPostQueryFilters", "post service should detect when filtered queries need extra work");
expectIncludes(serverNotionClientJs, "NOTION_REQUEST_TIMEOUT_MS", "notion client should define a request timeout for upstream calls");
expectIncludes(serverNotionClientJs, "AbortController", "notion client should abort slow Notion requests");
const oversizedOperationNotionClient = loadCommonJsModule("server/notion-client.js", [], {
  process: {
    env: {
      ...process.env,
      NOTION_OPERATION_TIMEOUT_MS: "40000",
      NOTION_TOKEN: "smoke-test-notion-token",
    },
  },
});
assert.equal(
  oversizedOperationNotionClient.NOTION_OPERATION_TIMEOUT_MS,
  30_000,
  "configured Notion operation budgets should clamp below the fixed browser request budget",
);
const oversizedExplicitOperation = oversizedOperationNotionClient.createNotionOperation({ timeoutMs: 40_000 });
assert.ok(
  oversizedExplicitOperation.deadlineAt - Date.now() <= 30_000,
  "explicit Notion operation budgets should respect the same server maximum",
);
oversizedExplicitOperation.dispose();
const { createSingleFlight } = loadCommonJsModule("server/cache-store.js");
const cancellableSingleFlight = createSingleFlight({ errorCooldownMs: 1_000 });
const firstSingleFlightConsumer = new AbortController();
const secondSingleFlightConsumer = new AbortController();
let singleFlightLoaderCount = 0;
let sharedSingleFlightSignal = null;
const pendingSingleFlightLoader = ({ signal }) => {
  singleFlightLoaderCount += 1;
  sharedSingleFlightSignal = signal;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
};
const firstSingleFlightResult = cancellableSingleFlight.run(pendingSingleFlightLoader, {
  signal: firstSingleFlightConsumer.signal,
});
const secondSingleFlightResult = cancellableSingleFlight.run(pendingSingleFlightLoader, {
  signal: secondSingleFlightConsumer.signal,
});
await Promise.resolve();
assert.equal(singleFlightLoaderCount, 1, "single-flight consumers should share one upstream loader");
const firstSingleFlightAbort = new Error("first consumer left");
firstSingleFlightAbort.name = "AbortError";
const firstSingleFlightRejection = assert.rejects(
  firstSingleFlightResult,
  (error) => error === firstSingleFlightAbort,
  "a disconnected single-flight consumer should stop waiting immediately",
);
firstSingleFlightConsumer.abort(firstSingleFlightAbort);
await firstSingleFlightRejection;
assert.equal(
  sharedSingleFlightSignal?.aborted,
  false,
  "one disconnected consumer must not cancel work still needed by another consumer",
);
const secondSingleFlightAbort = new Error("last consumer left");
secondSingleFlightAbort.name = "AbortError";
const secondSingleFlightRejection = assert.rejects(
  secondSingleFlightResult,
  (error) => error === secondSingleFlightAbort,
  "the final disconnected single-flight consumer should stop waiting immediately",
);
secondSingleFlightConsumer.abort(secondSingleFlightAbort);
await secondSingleFlightRejection;
assert.equal(
  sharedSingleFlightSignal?.aborted,
  true,
  "the final disconnected consumer should abort the now-orphaned upstream loader",
);
const recoveredSingleFlightValue = await cancellableSingleFlight.run(async () => {
  singleFlightLoaderCount += 1;
  return "recovered";
}, { signal: new AbortController().signal });
assert.equal(recoveredSingleFlightValue, "recovered", "subscriber cancellation should not enter the error cooldown");
assert.equal(singleFlightLoaderCount, 2, "a request after full cancellation should start fresh upstream work");
const staleFailureSingleFlight = createSingleFlight({ errorCooldownMs: 1_000 });
const staleFailureConsumer = new AbortController();
let rejectStaleFailure;
let staleFailureLoaderCount = 0;
const staleFailureResult = staleFailureSingleFlight.run(() => {
  staleFailureLoaderCount += 1;
  return new Promise((resolve, reject) => {
    rejectStaleFailure = reject;
  });
}, { signal: staleFailureConsumer.signal });
await Promise.resolve();
const staleFailureConsumerRejection = assert.rejects(
  staleFailureResult,
  (error) => error?.name === "AbortError",
  "an abandoned loader that ignores cancellation should still release its consumer",
);
staleFailureConsumer.abort(new DOMException("stale failure consumer left", "AbortError"));
await staleFailureConsumerRejection;
assert.equal(
  await staleFailureSingleFlight.run(async () => {
    staleFailureLoaderCount += 1;
    return "fresh after stale failure";
  }, { signal: new AbortController().signal }),
  "fresh after stale failure",
  "new single-flight work should replace an abandoned loader that ignores cancellation",
);
rejectStaleFailure(new Error("late stale failure"));
await Promise.resolve();
await Promise.resolve();
assert.equal(
  await staleFailureSingleFlight.run(async () => {
    staleFailureLoaderCount += 1;
    return "unpoisoned";
  }, { signal: new AbortController().signal }),
  "unpoisoned",
  "a late failure from abandoned work must not poison the current cooldown state",
);
assert.equal(staleFailureLoaderCount, 3, "late abandoned failure should not suppress a new loader");
const staleSuccessSingleFlight = createSingleFlight({ errorCooldownMs: 1_000 });
const staleSuccessConsumer = new AbortController();
let resolveStaleSuccess;
let staleSuccessLoaderCount = 0;
const staleSuccessResult = staleSuccessSingleFlight.run(() => {
  staleSuccessLoaderCount += 1;
  return new Promise((resolve) => {
    resolveStaleSuccess = resolve;
  });
}, { signal: staleSuccessConsumer.signal });
await Promise.resolve();
const staleSuccessConsumerRejection = assert.rejects(
  staleSuccessResult,
  (error) => error?.name === "AbortError",
  "an abandoned successful loader should release its consumer",
);
staleSuccessConsumer.abort(new DOMException("stale success consumer left", "AbortError"));
await staleSuccessConsumerRejection;
const currentSingleFlightError = new Error("current loader failed");
await assert.rejects(
  () => staleSuccessSingleFlight.run(async () => {
    staleSuccessLoaderCount += 1;
    throw currentSingleFlightError;
  }, { signal: new AbortController().signal }),
  (error) => error === currentSingleFlightError,
  "the replacement loader should establish the active error cooldown",
);
resolveStaleSuccess("late stale success");
await Promise.resolve();
await Promise.resolve();
await assert.rejects(
  () => staleSuccessSingleFlight.run(async () => {
    staleSuccessLoaderCount += 1;
    return "should stay cooled";
  }, { signal: new AbortController().signal }),
  (error) => error === currentSingleFlightError,
  "a late success from abandoned work must not erase the replacement loader cooldown",
);
assert.equal(staleSuccessLoaderCount, 2, "the active cooldown should still suppress a third loader");
const headerTimeoutNotionClient = loadCommonJsModule("server/notion-client.js", [], {
  process: {
    env: {
      ...process.env,
      NOTION_REQUEST_TIMEOUT_MS: "20",
      NOTION_TOKEN: "smoke-test-notion-token",
    },
  },
  fetch: async (_url, { signal }) => new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }),
});
await assert.rejects(
  () => headerTimeoutNotionClient.requestNotionJson("/databases/pending-headers"),
  (error) => error?.status === 504 && error?.code === "notion_timeout_error",
  "an active Notion deadline should keep the invocation alive even when fetch exposes no event-loop handle",
);
const bodyTimeoutProcess = {
  env: {
    ...process.env,
    NOTION_REQUEST_TIMEOUT_MS: "20",
    NOTION_TOKEN: "smoke-test-notion-token",
  },
};
const bodyTimeoutNotionClient = loadCommonJsModule("server/notion-client.js", [], {
  process: bodyTimeoutProcess,
  fetch: async (_url, { signal }) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json() {
      return new Promise((resolve, reject) => {
        const lateBodyTimer = setTimeout(() => resolve({ arrivedTooLate: true }), 100);
        const rejectAsAborted = () => {
          clearTimeout(lateBodyTimer);
          const error = new Error("response body aborted");
          error.name = "AbortError";
          reject(error);
        };
        if (signal.aborted) {
          rejectAsAborted();
          return;
        }
        signal.addEventListener("abort", rejectAsAborted, { once: true });
      });
    },
  }),
});
await assert.rejects(
  () => bodyTimeoutNotionClient.requestNotionJson("/databases/smoke-test"),
  (error) => {
    assert.equal(error?.status, 504);
    assert.equal(error?.code, "notion_timeout_error");
    return true;
  },
  "notion client timeout should remain active until the response body has been consumed",
);
const invalidJsonNotionClient = loadCommonJsModule("server/notion-client.js", [], {
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "smoke-test-notion-token",
    },
  },
  fetch: async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    async json() {
      throw new SyntaxError("Unexpected token");
    },
  }),
});
await assert.rejects(
  () => invalidJsonNotionClient.requestNotionJson("/pages/invalid-json"),
  (error) => {
    assert.equal(error?.status, 502);
    assert.equal(error?.code, "notion_invalid_response");
    assert.equal(error?.resourceType, "page");
    return true;
  },
  "notion client should classify successful responses with malformed JSON deterministically",
);
assert.throws(
  () => invalidJsonNotionClient.parseNotionPaginationResponse({
    has_more: false,
    next_cursor: null,
  }, { resourceType: "database" }),
  (error) => error?.status === 502
    && error?.code === "notion_invalid_response"
    && error?.resourceType === "database",
  "Notion pagination should reject a 200 payload with no results array",
);
assert.throws(
  () => invalidJsonNotionClient.parseNotionPaginationResponse({
    results: [],
    has_more: true,
    next_cursor: null,
  }, { resourceType: "block" }),
  (error) => error?.status === 502
    && error?.code === "notion_invalid_response"
    && error?.resourceType === "block",
  "Notion pagination should reject has_more without a usable next cursor",
);
expectIncludes(serverBlockServiceJs, "runWithBlockChildConcurrency", "block service should limit recursive block child fetch concurrency");
expectIncludes(serverPublicPolicyJs, "buildDatabaseWidePublicAccessPolicy", "public policy should keep v2.5-compatible database-wide public mode");
expectNotIncludes(
  serverPublicPolicyJs,
  "buildPublicAccessPolicyFromDatabase(database)",
  "public policy should not pass unused database metadata to the database-wide public policy builder",
);
expectNotIncludes(serverPublicPolicyJs, "findPropertyEntriesByCandidates", "public policy should not inspect public visibility properties in database-wide public mode");
expectNotIncludes(serverPublicPolicyJs, "NOTION_PUBLIC_PROPERTY_NAME", "public policy should ignore public visibility property env vars in database-wide public mode");
expectNotIncludes(serverPublicPolicyJs, "NOTION_PUBLIC_STATUS_VALUES", "public policy should ignore public status env vars in database-wide public mode");
expectNotIncludes(serverPublicPolicyJs, "NOTION_ALLOW_DATABASE_WIDE_PUBLIC_ACCESS", "public policy should not require opt-in for database-wide public mode");
expectIncludes(serverPostServiceJs, 'require("../js/notion-content")', "post service should reuse the shared notion content helpers");
expectIncludes(serverRenderServiceJs, "buildSharedArticleStructuredData", "render service should delegate article structured data to the shared content helper");
expectIncludes(serverNotionSchemaJs, "resolveNotionContentSchema", "schema service should resolve renamed content properties from database metadata");
expectIncludes(serverRenderServiceJs, "renderPostContent", "render service should render SSR post HTML without duplicating it in API payloads");
expectIncludes(serverCacheStoreJs, "createPendingRequestMap", "cache store should centralize pending request de-duplication");
const pendingRequestHelpers = loadCommonJsModule("server/cache-store.js");
const pendingRequestMap = pendingRequestHelpers.createPendingRequestMap();
const firstSubscriberController = new AbortController();
const secondSubscriberController = new AbortController();
let sharedPendingSignal = null;
let sharedPendingLoaderCount = 0;
const loadSharedPendingValue = ({ signal }) => new Promise((_resolve, reject) => {
  sharedPendingLoaderCount += 1;
  sharedPendingSignal = signal;
  signal.addEventListener("abort", () => reject(signal.reason), { once: true });
});
const firstPendingSubscriber = pendingRequestMap.subscribe(
  "shared-post",
  loadSharedPendingValue,
  { signal: firstSubscriberController.signal },
);
const secondPendingSubscriber = pendingRequestMap.subscribe(
  "shared-post",
  loadSharedPendingValue,
  { signal: secondSubscriberController.signal },
);
firstSubscriberController.abort(new Error("first subscriber left"));
await assert.rejects(() => firstPendingSubscriber);
assert.equal(
  sharedPendingSignal.aborted,
  false,
  "one disconnected caller must not cancel shared Notion work needed by another subscriber",
);
secondSubscriberController.abort(new Error("last subscriber left"));
const replacementPendingSubscriber = pendingRequestMap.subscribe(
  "shared-post",
  () => {
    sharedPendingLoaderCount += 1;
    return Promise.resolve("replacement");
  },
);
await assert.rejects(() => secondPendingSubscriber);
assert.equal(
  sharedPendingSignal.aborted,
  true,
  "shared Notion work should abort once its final subscriber disconnects",
);
assert.equal(
  await replacementPendingSubscriber,
  "replacement",
  "a new caller should not attach to an already-aborted shared request",
);
assert.equal(
  sharedPendingLoaderCount,
  2,
  "a caller arriving after full disconnect should start one fresh loader",
);
expectNotIncludes(serverPostServiceJs, "buildSearchFilter", "post service should not delegate search semantics to upstream filters that behave differently from local search");
expectNotIncludes(serverPostServiceJs, 'category === "閸忋劑鍎?', "post service should not compare against a mojibake category label");
const resolvedContentSchema = serverNotionHelpers.buildContentSchema({
  properties: {
    Title: { id: "title", name: "Title", type: "title" },
    Summary: { id: "excerpt", name: "Summary", type: "rich_text" },
    Category: { id: "category", name: "Category", type: "select" },
    "Published At": { id: "date", name: "Published At", type: "date" },
  },
});
assert.equal(
  resolvedContentSchema.title?.name,
  "Title",
  "server notion layer should resolve renamed content properties from database metadata",
);
assert.equal(
  JSON.stringify(serverNotionHelpers.buildDatabaseSorts(resolvedContentSchema)),
  JSON.stringify([{
    property: "Published At",
    direction: "descending",
  }]),
  "server notion layer should sort by the resolved date property instead of a hardcoded field name",
);
assert.equal(
  JSON.stringify(serverNotionHelpers.buildCategoryFilter("Tech", {
    category: { name: "Category", type: "select" },
  })),
  JSON.stringify({
    property: "Category",
    select: { equals: "Tech" },
  }),
  "category prefilter should only be emitted when the Notion schema still matches the expected select field",
);
assert.equal(
  serverNotionHelpers.buildCategoryFilter("Tech", {
    category: { name: "Category", type: "multi_select" },
  }),
  null,
  "category prefilter should disable itself instead of breaking requests when the Notion schema drifts",
);
const dynamicPublicCategories = serverNotionHelpers.buildPublicCategories({
  database: {
    properties: {
      Category: {
        id: "category",
        name: "Category",
        type: "select",
        select: {
          options: [
            { name: "AI", color: "blue" },
            { name: "读书", color: "green" },
          ],
        },
      },
    },
  },
  schema: {
    category: { id: "category", name: "Category", type: "select" },
  },
  posts: [
    { category: "项目记录" },
  ],
});
assert.equal(
  JSON.stringify(dynamicPublicCategories.map((category) => category.name)),
  JSON.stringify(["全部", "精选", "AI", "读书", "项目记录"]),
  "server notion layer should build category navigation from Notion select options plus used post categories while pinning featured",
);
assert.equal(
  serverNotionHelpers.decoratePostSummary({ id: "custom-category", category: "AI" }, new Map([[
    "ai",
    { name: "AI", notionColor: "blue", optionIndex: 0 },
  ]])).categoryLabel,
  "AI",
  "server notion layer should attach category presentation metadata to post summaries",
);
const databaseWideDefaultPublicAccessPolicy = withEnvOverrides({}, () => serverNotionHelpers.buildPublicAccessPolicyFromDatabase());
assert.equal(
  databaseWideDefaultPublicAccessPolicy.propertyType,
  "database",
  "server notion layer should default to database-wide public mode when no public visibility field is explicitly configured",
);
assert.equal(
  databaseWideDefaultPublicAccessPolicy.filter,
  null,
  "database-wide public mode should not emit a Notion visibility filter",
);
const databaseWideWithIgnoredPublicEnvPolicy = withEnvOverrides({
  NOTION_PUBLIC_PROPERTY_NAME: "MissingPublicFlag",
  NOTION_PUBLIC_PROPERTY_NAMES: "Status,Public,发布状态",
  NOTION_PUBLIC_STATUS_VALUES: "Published,Public,Live",
}, () => serverNotionHelpers.buildPublicAccessPolicyFromDatabase());
assert.equal(
  databaseWideWithIgnoredPublicEnvPolicy.propertyType,
  "database",
  "server notion layer should keep exposing the configured database even if legacy public env vars are set",
);
assert.equal(
  databaseWideWithIgnoredPublicEnvPolicy.filter,
  null,
  "database-wide public mode should ignore legacy public env vars and avoid Notion visibility filters",
);
assert.equal(
  serverNotionHelpers.filterPostsBySearch([
    { title: "", excerpt: "", tags: ["TypeScript"] },
    { title: "Other", excerpt: "", tags: ["Docs"] },
  ], "script").length,
  1,
  "local post search should preserve substring matches for tag text",
);
const boundedPostQueryFilters = serverNotionHelpers.normalizePostQueryFilters({
  category: ` ${"c".repeat(180)} `,
  search: ` ${"s".repeat(320)} `,
});
assert.equal(
  boundedPostQueryFilters.category.length,
  128,
  "server notion layer should cap category query input length before caching and filtering",
);
assert.equal(
  boundedPostQueryFilters.search.length,
  256,
  "server notion layer should cap search query input length before caching and filtering",
);
assert.equal(
  serverNotionHelpers.normalizePositiveInteger("2abc", 1),
  1,
  "server notion layer should reject partially numeric pagination values",
);
assert.equal(
  serverNotionHelpers.normalizePositiveInteger("02", 1),
  2,
  "server notion layer should still accept canonicalizable numeric pagination values",
);
const builtPostPayload = serverNotionHelpers.buildPostPayload(
  {
    id: "post-1",
    title: "Payload title",
    excerpt: "Payload excerpt",
    category: "Tech",
    date: "2026-04-11",
    readTime: "5 min",
    tags: [],
  },
  [{
    type: "paragraph",
    paragraph: {
      rich_text: [{ plain_text: "Server rendered body" }],
    },
  }],
);
assert.ok(
  Array.isArray(builtPostPayload.content) && !("renderedContent" in builtPostPayload),
  "server notion layer should return structured post content without duplicating rendered HTML in the payload",
);
assert.equal(
  serverNotionHelpers.renderPostContent(builtPostPayload, { baseOrigin: "https://example.com" }),
  "<p>Server rendered body</p>",
  "server notion layer should render post HTML on demand from structured content",
);
const queryCacheFetchCounts = {
  database: 0,
  pageQueries: 0,
};
const queryCacheRequestBodies = [];
const queryCacheServerNotion = loadCommonJsModule("server/notion-server.js", [], {
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "query-cache-database",
      SITE_URL: "https://example.com",
      PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS: "120000",
    },
  },
  fetch: async (url, init = {}) => {
    const requestUrl = String(url);

    if (requestUrl.endsWith("/databases/query-cache-database")) {
      queryCacheFetchCounts.database += 1;
      return createJsonResponse({
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
          Excerpt: { id: "excerpt", name: "Excerpt", type: "rich_text" },
          Tags: { id: "tags", name: "Tags", type: "multi_select" },
          Category: {
            id: "category",
            name: "Category",
            type: "select",
            select: {
              options: [
                { name: "Tech", color: "blue" },
                { name: "AI", color: "purple" },
              ],
            },
          },
        },
      });
    }

    if (requestUrl.endsWith("/databases/query-cache-database/query")) {
      queryCacheFetchCounts.pageQueries += 1;
      const requestBody = JSON.parse(init?.body || "{}");
      queryCacheRequestBodies.push(requestBody);
      const requestedCategory = requestBody?.filter?.select?.equals;

      if (requestedCategory === "tech") {
        return createJsonResponse({
          results: [],
          has_more: false,
          next_cursor: null,
        });
      }

      return createJsonResponse({
        results: [
          {
            id: "search-post-alpha",
            properties: {
              Name: {
                id: "title",
                name: "Name",
                type: "title",
                title: [{ plain_text: "Alpha article" }],
              },
              Excerpt: {
                id: "excerpt",
                name: "Excerpt",
                type: "rich_text",
                rich_text: [{ plain_text: "Searchable excerpt" }],
              },
              Tags: {
                id: "tags",
                name: "Tags",
                type: "multi_select",
                multi_select: [{ name: "alpha" }],
              },
              Category: {
                id: "category",
                name: "Category",
                type: "select",
                select: { name: "Tech" },
              },
            },
          },
          {
            id: "search-post-beta",
            properties: {
              Name: {
                id: "title",
                name: "Name",
                type: "title",
                title: [{ plain_text: "Beta article" }],
              },
              Excerpt: {
                id: "excerpt",
                name: "Excerpt",
                type: "rich_text",
                rich_text: [{ plain_text: "Other excerpt" }],
              },
              Tags: {
                id: "tags",
                name: "Tags",
                type: "multi_select",
                multi_select: [{ name: "beta" }],
              },
              Category: {
                id: "category",
                name: "Category",
                type: "select",
                select: { name: "Tech" },
              },
            },
          },
        ],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during filtered query cache test: ${requestUrl}`);
  },
});
const firstCachedQuery = await queryCacheServerNotion.queryPublicPosts({
  category: "Tech",
  search: "alpha",
  page: 1,
});
const secondCachedQuery = await queryCacheServerNotion.queryPublicPosts({
  category: "Tech",
  search: "alpha",
  page: 1,
});
const differentlySearchedQuery = await queryCacheServerNotion.queryPublicPosts({
  category: "Tech",
  search: "beta",
  page: 1,
});
assert.equal(
  queryCacheFetchCounts.pageQueries,
  1,
  "different searches in one category should reuse the same upstream category page set",
);
const pageQueriesBeforeUnknownCategory = queryCacheFetchCounts.pageQueries;
const differentlyCasedQuery = await queryCacheServerNotion.queryPublicPosts({
  category: "tech",
  search: "alpha",
  page: 1,
});
assert.equal(
  queryCacheFetchCounts.pageQueries,
  pageQueriesBeforeUnknownCategory,
  "a category absent from database select options should not reach the Notion query endpoint",
);
assert.equal(
  queryCacheFetchCounts.database,
  1,
  "server notion layer should reuse one database metadata lookup while caching filtered list queries",
);
assert.equal(
  queryCacheFetchCounts.pageQueries,
  1,
  "same-category searches should reuse one category base query and unknown categories should not reach Notion",
);
assert.equal(
  queryCacheRequestBodies[0]?.filter?.property,
  "Category",
  "server notion layer should still push category filters down to the Notion database query when possible",
);
assert.equal(
  firstCachedQuery.total,
  1,
  "server notion layer should still apply local search filtering after the category-prefiltered query returns",
);
assert.equal(
  JSON.stringify(firstCachedQuery.categories.map((category) => category.name)),
  JSON.stringify(["全部", "精选", "Tech", "AI"]),
  "server notion layer should include Notion select options in public list category navigation",
);
assert.equal(
  firstCachedQuery.results[0]?.categoryColor?.color,
  "#2979ff",
  "server notion layer should decorate list results with category colors derived from Notion/category config",
);
assert.equal(
  secondCachedQuery.results[0]?.id,
  "search-post-alpha",
  "server notion layer should locally reapply an identical search to the cached category base pages",
);
assert.equal(
  differentlySearchedQuery.results[0]?.id,
  "search-post-beta",
  "server notion layer should locally apply different searches without repeating the category query",
);
assert.equal(
  differentlyCasedQuery.total,
  0,
  "server notion layer should return an empty result for a category absent from the database select options",
);

const staleMetadataFetches = [];
const staleMetadataService = loadCommonJsModule("server/post-service.js", [], {
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "stale-metadata-database",
      DATABASE_METADATA_TTL_MS: "120000",
      SITE_URL: "https://example.com",
      VERCEL: "1",
    },
  },
  fetch: (url) => new Promise((resolve) => {
    staleMetadataFetches.push({ resolve, url: String(url) });
  }),
});
const waitForStaleMetadataState = async (predicate, label) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out while waiting for ${label}`);
};
const buildMetadataResponse = (id, onRead = () => {}) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  async json() {
    onRead();
    return {
      id,
      properties: {
        Name: { id: "title", name: "Name", type: "title" },
      },
    };
  },
});
const abandonedMetadataController = new AbortController();
const abandonedMetadataRequest = staleMetadataService.getDatabaseMetadata({
  operation: { signal: abandonedMetadataController.signal },
});
await waitForStaleMetadataState(
  () => staleMetadataFetches.length === 1,
  "the abandoned metadata request to reach fetch",
);
const abandonedMetadataReason = new Error("metadata subscriber disconnected");
abandonedMetadataReason.name = "AbortError";
const abandonedMetadataRejection = assert.rejects(
  abandonedMetadataRequest,
  (error) => error === abandonedMetadataReason,
  "the abandoned metadata subscriber should stop waiting immediately",
);
abandonedMetadataController.abort(abandonedMetadataReason);
await abandonedMetadataRejection;

const freshMetadataController = new AbortController();
const freshMetadataRequest = staleMetadataService.getDatabaseMetadata({
  operation: { signal: freshMetadataController.signal },
});
await waitForStaleMetadataState(
  () => staleMetadataFetches.length === 2,
  "a replacement metadata request to start",
);
staleMetadataFetches[1].resolve(buildMetadataResponse("fresh-metadata"));
assert.equal(
  (await freshMetadataRequest).database.id,
  "fresh-metadata",
  "the replacement metadata request should populate the cache",
);

let didReadAbandonedMetadata = false;
staleMetadataFetches[0].resolve(buildMetadataResponse("stale-metadata", () => {
  didReadAbandonedMetadata = true;
}));
await waitForStaleMetadataState(
  () => didReadAbandonedMetadata,
  "the abandoned metadata response to arrive late",
);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(
  staleMetadataService.getCachedDatabaseMetadata().database.id,
  "fresh-metadata",
  "an abandoned late single-flight result must not overwrite fresher shared metadata",
);
const dedupedFetchCounts = {
  database: 0,
  page: 0,
  blocks: 0,
};
const dedupedServerNotion = loadCommonJsModule("server/notion-server.js", [], {
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "test-database",
      SITE_URL: "https://example.com",
    },
  },
  fetch: async (url) => {
    const requestUrl = String(url);

    if (requestUrl.endsWith("/databases/test-database")) {
      dedupedFetchCounts.database += 1;
      return createJsonResponse({
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
        },
      });
    }

    if (requestUrl.endsWith("/pages/post-1")) {
      dedupedFetchCounts.page += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return createJsonResponse({
        id: "post-1",
        parent: { database_id: "test-database" },
        properties: {
          Name: {
            id: "title",
            name: "Name",
            type: "title",
            title: [{ plain_text: "Deduped title" }],
          },
        },
      });
    }

    if (requestUrl.includes("/blocks/post-1/children?")) {
      dedupedFetchCounts.blocks += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return createJsonResponse({
        results: [{
          id: "block-1",
          type: "paragraph",
          has_children: false,
          paragraph: {
            rich_text: [{ plain_text: "Deduped body" }],
          },
        }],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during dedupe test: ${requestUrl}`);
  },
});
const [dedupedPostA, dedupedPostB] = await Promise.all([
  dedupedServerNotion.fetchPublicPost("post-1"),
  dedupedServerNotion.fetchPublicPost("post-1"),
]);
assert.strictEqual(
  dedupedPostA,
  dedupedPostB,
  "server notion layer should resolve concurrent post-detail requests through the same in-flight promise",
);
assert.equal(
  dedupedFetchCounts.database,
  1,
  "server notion layer should still reuse the shared database metadata lookup while coalescing concurrent post-detail requests",
);
assert.equal(
  dedupedFetchCounts.page,
  1,
  "server notion layer should fetch the Notion page only once for concurrent requests to the same post",
);
assert.equal(
  dedupedFetchCounts.blocks,
  1,
  "server notion layer should fetch the Notion block tree only once for concurrent requests to the same post",
);
assert.equal(
  dedupedPostA.content?.[0]?.text,
  "Deduped body",
  "server notion layer should still return the mapped block content after coalescing concurrent requests",
);
const encodedPathRequests = [];
const encodedPathServerNotion = loadCommonJsModule("server/notion-server.js", [], {
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "encoded/database",
      SITE_URL: "https://example.com",
    },
  },
  fetch: async (url) => {
    const requestUrl = String(url);
    encodedPathRequests.push(requestUrl);

    if (requestUrl.endsWith("/databases/encoded%2Fdatabase")) {
      return createJsonResponse({
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
        },
      });
    }

    if (requestUrl.endsWith("/pages/unsafe%2Fpost%3Fdebug%3D1")) {
      return createJsonResponse({
        id: "safe-post-id",
        parent: { database_id: "encoded/database" },
        properties: {
          Name: {
            id: "title",
            name: "Name",
            type: "title",
            title: [{ plain_text: "Encoded path title" }],
          },
        },
      });
    }

    if (requestUrl.includes("/blocks/safe-post-id/children?")) {
      return createJsonResponse({
        results: [],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during encoded path test: ${requestUrl}`);
  },
});
const encodedPathPost = await encodedPathServerNotion.fetchPublicPost("unsafe/post?debug=1");
assert.equal(
  encodedPathPost.id,
  "safe-post-id",
  "server notion layer should still map the public page returned for an encoded page id",
);
assert.ok(
  encodedPathRequests.some((requestUrl) => requestUrl.endsWith("/pages/unsafe%2Fpost%3Fdebug%3D1")),
  "server notion layer should encode route-supplied Notion page ids before building API paths",
);
assert.ok(
  encodedPathRequests.some((requestUrl) => requestUrl.includes("/blocks/safe-post-id/children?")),
  "server notion layer should fetch blocks using the canonical Notion page id returned by the API",
);
const retryFetchCounts = {
  database: 0,
  page: 0,
  blocks: 0,
};
let shouldFailNextRetryPageRequest = true;
const retryServerNotion = loadCommonJsModule("server/notion-server.js", [], {
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "retry-database",
      SITE_URL: "https://example.com",
    },
  },
  fetch: async (url) => {
    const requestUrl = String(url);

    if (requestUrl.endsWith("/databases/retry-database")) {
      retryFetchCounts.database += 1;
      return createJsonResponse({
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
        },
      });
    }

    if (requestUrl.endsWith("/pages/retry-post")) {
      retryFetchCounts.page += 1;
      if (shouldFailNextRetryPageRequest) {
        shouldFailNextRetryPageRequest = false;
        return createJsonResponse({
          message: "temporary upstream failure",
          code: "internal_server_error",
        }, {
          status: 500,
        });
      }

      return createJsonResponse({
        id: "retry-post",
        parent: { database_id: "retry-database" },
        properties: {
          Name: {
            id: "title",
            name: "Name",
            type: "title",
            title: [{ plain_text: "Recovered title" }],
          },
        },
      });
    }

    if (requestUrl.includes("/blocks/retry-post/children?")) {
      retryFetchCounts.blocks += 1;
      return createJsonResponse({
        results: [{
          id: "retry-block-1",
          type: "paragraph",
          has_children: false,
          paragraph: {
            rich_text: [{ plain_text: "Recovered body" }],
          },
        }],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during retry test: ${requestUrl}`);
  },
});
await assert.rejects(
  () => retryServerNotion.fetchPublicPost("retry-post"),
  (error) => {
    assert.equal(error?.status, 500);
    return true;
  },
  "server notion layer should surface the original upstream failure for the first failed post-detail request",
);
const recoveredRetryPost = await retryServerNotion.fetchPublicPost("retry-post");
assert.equal(
  retryFetchCounts.page,
  2,
  "server notion layer should clear failed in-flight post-detail requests so the next retry can re-fetch the page",
);
assert.equal(
  retryFetchCounts.blocks,
  1,
  "server notion layer should only fetch block children once after the retry successfully loads the page metadata",
);
assert.equal(
  recoveredRetryPost.title,
  "Recovered title",
  "server notion layer should recover cleanly after a failed in-flight post-detail request",
);
let invalidPostCacheNow = 0;
class InvalidPostCacheDate extends Date {
  static now() {
    return invalidPostCacheNow;
  }
}
const invalidPostCacheFetchCounts = {
  database: 0,
  page: 0,
  blocks: 0,
};
const invalidPostCacheServerNotion = loadCommonJsModule("server/notion-server.js", [], {
  Date: InvalidPostCacheDate,
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "ttl-post-database",
      PUBLIC_POST_CACHE_TTL_MS: "not-a-number",
      SITE_URL: "https://example.com",
    },
  },
  fetch: async (url) => {
    const requestUrl = String(url);

    if (requestUrl.endsWith("/databases/ttl-post-database")) {
      invalidPostCacheFetchCounts.database += 1;
      return createJsonResponse({
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
        },
      });
    }

    if (requestUrl.endsWith("/pages/ttl-post")) {
      invalidPostCacheFetchCounts.page += 1;
      return createJsonResponse({
        id: "ttl-post",
        parent: { database_id: "ttl-post-database" },
        properties: {
          Name: {
            id: "title",
            name: "Name",
            type: "title",
            title: [{ plain_text: `TTL post ${invalidPostCacheFetchCounts.page}` }],
          },
        },
      });
    }

    if (requestUrl.includes("/blocks/ttl-post/children?")) {
      invalidPostCacheFetchCounts.blocks += 1;
      return createJsonResponse({
        results: [],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during invalid post cache TTL test: ${requestUrl}`);
  },
});
await invalidPostCacheServerNotion.fetchPublicPost("ttl-post");
invalidPostCacheNow = 61_000;
await invalidPostCacheServerNotion.fetchPublicPost("ttl-post");
assert.equal(
  invalidPostCacheFetchCounts.page,
  2,
  "server notion layer should fall back to the default post cache TTL when the env value is invalid",
);
let invalidMetadataNow = 0;
class InvalidMetadataDate extends Date {
  static now() {
    return invalidMetadataNow;
  }
}
const invalidMetadataFetchCounts = {
  database: 0,
  query: 0,
};
const invalidMetadataServerNotion = loadCommonJsModule("server/notion-server.js", [], {
  Date: InvalidMetadataDate,
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "ttl-metadata-database",
      DATABASE_METADATA_TTL_MS: "not-a-number",
      SITE_URL: "https://example.com",
    },
  },
  fetch: async (url) => {
    const requestUrl = String(url);

    if (requestUrl.endsWith("/databases/ttl-metadata-database")) {
      invalidMetadataFetchCounts.database += 1;
      return createJsonResponse({
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
        },
      });
    }

    if (requestUrl.endsWith("/databases/ttl-metadata-database/query")) {
      invalidMetadataFetchCounts.query += 1;
      return createJsonResponse({
        results: [],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during invalid metadata TTL test: ${requestUrl}`);
  },
});
await invalidMetadataServerNotion.queryPublicPosts();
invalidMetadataNow = 301_000;
await invalidMetadataServerNotion.queryPublicPosts();
assert.equal(
  invalidMetadataFetchCounts.database,
  2,
  "server notion layer should fall back to the default database metadata TTL when the env value is invalid",
);
const vercelTimerStarts = [];
const vercelPostService = loadCommonJsModule("server/post-service.js", [], {
  process: {
    env: {
      ...process.env,
      VERCEL: "1",
    },
  },
  setInterval() {
    vercelTimerStarts.push("started");
    return { unref() {} };
  },
});
assert.equal(
  vercelTimerStarts.length,
  0,
  "post service should not start a background cache sweep interval inside Vercel serverless functions",
);
assert.equal(
  vercelPostService.shouldStartCacheSweepTimer(),
  false,
  "post service should report cache sweep timers as disabled in Vercel",
);
const localTimerStarts = [];
const localTimerEnv = { ...process.env };
delete localTimerEnv.VERCEL;
const localPostService = loadCommonJsModule("server/post-service.js", [], {
  process: {
    env: localTimerEnv,
  },
  setInterval(_callback, intervalMs) {
    localTimerStarts.push(intervalMs);
    return {
      unref() {
        localTimerStarts.push("unref");
      },
    };
  },
});
assert.equal(
  localTimerStarts[0],
  localPostService.CACHE_SWEEP_INTERVAL_MS,
  "post service should still start cache sweeping in long-lived local/server runtimes",
);
assert.equal(
  localTimerStarts[1],
  "unref",
  "post service should keep the local cache sweep interval from pinning the process",
);

const blockBudgetRequests = [];
const blockBudgetWarnings = [];
const blockBudgetService = loadCommonJsModule("server/block-service.js", [], {
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "block-budget-database",
      NOTION_BLOCK_CHILD_CONCURRENCY: "1",
      NOTION_BLOCK_TOTAL_LIMIT: "3",
    },
  },
  console: {
    ...console,
    warn(message, ...args) {
      blockBudgetWarnings.push([message, ...args].join(" "));
    },
  },
  fetch: async (url) => {
    const requestUrl = String(url);
    blockBudgetRequests.push(requestUrl);

    if (requestUrl.includes("/blocks/deep-root/children?")) {
      return createJsonResponse({
        results: [
          { id: "child-a", type: "toggle", has_children: true },
          { id: "child-b", type: "toggle", has_children: true },
        ],
        has_more: false,
        next_cursor: null,
      });
    }

    if (requestUrl.includes("/blocks/child-a/children?")) {
      return createJsonResponse({
        results: [
          { id: "grandchild-a", type: "paragraph", has_children: false },
          { id: "grandchild-b", type: "paragraph", has_children: false },
        ],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during block budget test: ${requestUrl}`);
  },
});
assert.equal(
  blockBudgetService.NOTION_BLOCK_TOTAL_LIMIT,
  3,
  "block service should read the configured total block budget",
);
await assert.rejects(
  () => blockBudgetService.fetchAllBlockChildren("deep-root"),
  (error) => {
    assert.equal(error?.status, 502);
    assert.equal(error?.code, "notion_content_incomplete");
    return true;
  },
  "block service should fail closed instead of caching a silently truncated article",
);
assert.equal(
  blockBudgetRequests.some((requestUrl) => requestUrl.includes("/blocks/child-b/children?")),
  false,
  "block service should avoid fetching more nested child trees once the total block budget is exhausted",
);
assert.ok(
  blockBudgetWarnings.some((message) => message.includes("total block budget (3) exhausted")),
  "block service should warn when the total block budget truncates a deep Notion page",
);

let singleFlightCooldownNow = 50_000;
class SingleFlightCooldownDate extends Date {
  static now() {
    return singleFlightCooldownNow;
  }
}
const singleFlightCooldownFetchCounts = {
  database: 0,
  query: 0,
};
const singleFlightCooldownServerNotion = loadCommonJsModule("server/notion-server.js", [], {
  Date: SingleFlightCooldownDate,
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "single-flight-cooldown-database",
      NOTION_SINGLE_FLIGHT_ERROR_COOLDOWN_MS: "1000",
      SITE_URL: "https://example.com",
      VERCEL: "1",
    },
  },
  fetch: async (url) => {
    const requestUrl = String(url);

    if (requestUrl.endsWith("/databases/single-flight-cooldown-database")) {
      singleFlightCooldownFetchCounts.database += 1;
      if (singleFlightCooldownNow < 51_001) {
        return createJsonResponse({
          message: "Rate limited",
          code: "rate_limited",
        }, {
          status: 429,
          headers: { "retry-after": "3" },
        });
      }

      return createJsonResponse({
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
        },
      });
    }

    if (requestUrl.endsWith("/databases/single-flight-cooldown-database/query")) {
      singleFlightCooldownFetchCounts.query += 1;
      return createJsonResponse({
        results: [],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during single-flight cooldown test: ${requestUrl}`);
  },
});
await assert.rejects(
  () => singleFlightCooldownServerNotion.queryPublicPosts(),
  (error) => {
    assert.equal(error?.status, 429);
    assert.equal(error?.notionCode, "rate_limited");
    return true;
  },
  "server notion layer should surface the first upstream rate-limit error",
);
await assert.rejects(
  () => singleFlightCooldownServerNotion.queryPublicPosts(),
  (error) => {
    assert.equal(error?.status, 429);
    assert.equal(error?.notionCode, "rate_limited");
    return true;
  },
  "server notion layer should reuse the cooled single-flight error inside the cooldown window",
);
assert.equal(
  singleFlightCooldownFetchCounts.database,
  1,
  "server notion layer should avoid hammering Notion while a single-flight error cooldown is active",
);
singleFlightCooldownNow = 51_001;
await assert.rejects(
  () => singleFlightCooldownServerNotion.queryPublicPosts(),
  (error) => {
    assert.equal(error?.status, 429);
    return true;
  },
  "Retry-After should extend the single-flight cooldown beyond the configured minimum",
);
assert.equal(
  singleFlightCooldownFetchCounts.database,
  1,
  "Retry-After cooldown should prevent an early metadata retry",
);
singleFlightCooldownNow = 53_001;
const recoveredCooldownQuery = await singleFlightCooldownServerNotion.queryPublicPosts();
assert.equal(
  singleFlightCooldownFetchCounts.database,
  2,
  "server notion layer should retry Notion after the single-flight error cooldown expires",
);
assert.equal(
  singleFlightCooldownFetchCounts.query,
  1,
  "server notion layer should continue the public list query after metadata recovers",
);
assert.equal(
  recoveredCooldownQuery.total,
  0,
  "server notion layer should return the recovered empty post list after a cooled rate-limit error",
);
assert.ok(
  !serverNotionJs.includes("鍔″繀鍚屾鏇存柊 js/notion-api.js"),
  "server notion layer should not depend on manually syncing duplicated client helpers",
);
assert.ok(
  !serverNotionJs.includes("queryAllPages"),
  "server notion layer should not expose the whole database as the public content set",
);

}
