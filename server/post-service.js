const {
  buildPostSearchText,
  mapNotionBlock,
  mapNotionPage,
  normalizeSearchText,
} = require("../js/notion-content");
const {
  ALL_CATEGORY,
  PUBLIC_CATEGORY_QUERY_MAX_LENGTH,
  buildCategoryOptionLookup,
  createCategoryNavigation,
  readCategorySelectOptions,
} = require("./category-navigation");
const {
  encodeNotionPathId,
  normalizeNonNegativeNumber,
  normalizeNotionId,
} = require("./notion-config");
const {
  createNotionOperation,
  createNotionRequestError,
  getDatabaseId,
  getSiteOrigin,
  parseNotionPaginationResponse,
  requestNotionJson,
  SITE_CONFIG,
} = require("./notion-client");
const { createAbortError } = require("./request-lifecycle");
const {
  MAX_PAGINATION_ROUNDS,
  fetchAllBlockChildren,
} = require("./block-service");
const {
  assertPublicPage,
  buildPublicAccessPolicyFromDatabase,
} = require("./public-policy");
const {
  buildCategoryFilter,
  buildContentSchema,
  buildDatabaseSorts,
  combineDatabaseFilters,
} = require("./notion-schema");
const {
  createLruTtlCache,
  createKeyedSingleFlight,
  createPendingRequestMap,
  createSingleFlight,
  createTtlSlot,
} = require("./cache-store");
const {
  withBlockImageSignatures,
  withCoverImageSignature,
} = require("./image-source-policy");

const DEFAULT_POST_PAGE_SIZE = 9;
const PUBLIC_SEARCH_QUERY_MAX_LENGTH = 256;
const DATABASE_METADATA_TTL_MS = normalizeNonNegativeNumber(process.env.DATABASE_METADATA_TTL_MS, 300_000);
const PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS = normalizeNonNegativeNumber(process.env.PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS, 120_000);
const PUBLIC_PAGE_QUERY_CACHE_MAX_ENTRIES = 24;
const PUBLIC_POST_CACHE_TTL_MS = normalizeNonNegativeNumber(process.env.PUBLIC_POST_CACHE_TTL_MS, 60_000);
const PUBLIC_POST_CACHE_MAX_ENTRIES = 20;
const NOTION_SINGLE_FLIGHT_ERROR_COOLDOWN_MS = normalizeNonNegativeNumber(
  process.env.NOTION_SINGLE_FLIGHT_ERROR_COOLDOWN_MS,
  2_000,
);
const CATEGORY_NAVIGATION = createCategoryNavigation(SITE_CONFIG?.categoryNavigation);
const {
  buildCategoryPresentation,
  buildPublicCategories,
  decoratePostSummary,
} = CATEGORY_NAVIGATION;
const postSearchTextCache = new WeakMap();

const databaseMetadataCache = createTtlSlot();
const databaseMetadataSingleFlight = createSingleFlight({
  errorCooldownMs: NOTION_SINGLE_FLIGHT_ERROR_COOLDOWN_MS,
});
const publicPageQueryCache = createLruTtlCache({ maxEntries: PUBLIC_PAGE_QUERY_CACHE_MAX_ENTRIES });
const publicPageQuerySingleFlight = createKeyedSingleFlight({
  maxEntries: PUBLIC_PAGE_QUERY_CACHE_MAX_ENTRIES,
  errorCooldownMs: NOTION_SINGLE_FLIGHT_ERROR_COOLDOWN_MS,
});
const publicPageSummaryCache = createTtlSlot({
  onExpire: () => publicPageQueryCache.clear(),
});
const publicPageSummarySingleFlight = createSingleFlight({
  errorCooldownMs: NOTION_SINGLE_FLIGHT_ERROR_COOLDOWN_MS,
});
const publicPostCache = createLruTtlCache({ maxEntries: PUBLIC_POST_CACHE_MAX_ENTRIES });
const pendingPublicPostRequests = createPendingRequestMap();

async function runWithNotionOperation(loader, { signal } = {}) {
  const operation = createNotionOperation();
  const onAbort = () => operation.abort(signal.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener?.("abort", onAbort, { once: true });
  try {
    if (operation.signal.aborted) throw operation.signal.reason;
    const value = await loader(operation);
    if (operation.signal.aborted) throw operation.signal.reason;
    return value;
  } catch (error) {
    operation.abort(error);
    throw error;
  } finally {
    signal?.removeEventListener?.("abort", onAbort);
    operation.dispose();
  }
}

function getNotionRequestOptions(operation) {
  return operation
    ? { signal: operation.signal, deadlineAt: operation.deadlineAt }
    : {};
}

function throwIfOperationAborted(operation) {
  if (!operation?.signal?.aborted) return;
  throw operation.signal.reason || createAbortError(
    "Notion operation aborted",
    "notion_operation_aborted",
  );
}

function createIncompleteContentError(message, resourceType = "database") {
  return createNotionRequestError(message, {
    status: 502,
    code: "notion_content_incomplete",
    resourceType,
  });
}

function getCachedDatabaseMetadata() {
  return databaseMetadataCache.get();
}

function getCachedPublicPageSummaries() {
  return publicPageSummaryCache.get();
}

function buildPublicPageQueryCacheKey(filters = {}) {
  const normalizedFilters = normalizePostQueryFilters(filters);
  return JSON.stringify({
    category: normalizedFilters.category,
  });
}

function getCachedPublicPageQuery(cacheKey) {
  return publicPageQueryCache.get(cacheKey, {
    clone: (pages) => (Array.isArray(pages) ? pages.slice() : null),
  });
}

function cachePublicPageQuery(cacheKey, pages, expiresAt, { operation } = {}) {
  if (!Array.isArray(pages)) {
    return;
  }

  throwIfOperationAborted(operation);
  publicPageQueryCache.set(cacheKey, pages.slice(), expiresAt);
}

async function getDatabaseMetadata({ operation } = {}) {
  const cached = getCachedDatabaseMetadata();
  if (cached?.publicAccessPolicy) {
    return cached;
  }

  return databaseMetadataSingleFlight.run(({ signal }) => runWithNotionOperation(async (sharedOperation) => {
    const cachedDuringWait = getCachedDatabaseMetadata();
    if (cachedDuringWait?.publicAccessPolicy) {
      return cachedDuringWait;
    }

    const database = await requestNotionJson(
      `/databases/${encodeNotionPathId(getDatabaseId())}`,
      getNotionRequestOptions(sharedOperation),
    );
    const publicAccessPolicy = buildPublicAccessPolicyFromDatabase();
    const contentSchema = buildContentSchema(database);
    const nextMetadata = {
      database,
      contentSchema,
      publicAccessPolicy,
      expiresAt: Date.now() + DATABASE_METADATA_TTL_MS,
    };
    throwIfOperationAborted(sharedOperation);
    databaseMetadataCache.set(nextMetadata, nextMetadata.expiresAt);
    return nextMetadata;
  }, { signal }), { signal: operation?.signal });
}

async function queryDatabasePages({ filter, schema = null, operation } = {}) {
  const databaseId = encodeNotionPathId(getDatabaseId());
  const pages = [];
  let startCursor = null;
  let rounds = 0;
  const seenCursors = new Set();
  const sorts = buildDatabaseSorts(schema);

  do {
    if (++rounds > MAX_PAGINATION_ROUNDS) {
      throw createIncompleteContentError(
        `Database query pagination exceeded ${MAX_PAGINATION_ROUNDS} rounds`,
      );
    }

    const body = {
      page_size: 100,
    };
    if (sorts) {
      body.sorts = sorts;
    }
    if (filter) {
      body.filter = filter;
    }
    if (startCursor) {
      body.start_cursor = startCursor;
    }

    const data = await requestNotionJson(`/databases/${databaseId}/query`, {
      ...getNotionRequestOptions(operation),
      method: "POST",
      body: JSON.stringify(body),
    });

    const {
      results: pageResults,
      nextCursor,
    } = parseNotionPaginationResponse(data, { resourceType: "database" });
    pages.push(...pageResults);
    if (nextCursor && seenCursors.has(nextCursor)) {
      throw createNotionRequestError("Notion API repeated a database pagination cursor", {
        status: 502,
        code: "notion_invalid_response",
        resourceType: "database",
      });
    }
    if (nextCursor) seenCursors.add(nextCursor);
    startCursor = nextCursor;
  } while (startCursor);

  const mappedPages = pages.map((page) => withCoverImageSignature(mapNotionPage(page, {
    includeSearchText: true,
    schema,
  })));
  return sorts ? mappedPages : sortPostsByDateDesc(mappedPages);
}

function sortPostsByDateDesc(posts) {
  return posts.slice().sort((left, right) => {
    const leftTimestamp = Date.parse(left?.date || "");
    const rightTimestamp = Date.parse(right?.date || "");
    const safeLeftTimestamp = Number.isFinite(leftTimestamp) ? leftTimestamp : 0;
    const safeRightTimestamp = Number.isFinite(rightTimestamp) ? rightTimestamp : 0;
    return safeRightTimestamp - safeLeftTimestamp;
  });
}

function filterPostsByCategory(posts, category) {
  if (!category || category === ALL_CATEGORY) {
    return posts.slice();
  }

  return posts.filter((post) => post.category === category);
}

function filterPostsBySearch(posts, search) {
  const normalizedSearch = normalizeSearchText(search);
  if (!normalizedSearch) {
    return posts.slice();
  }

  return posts.filter((post) => {
    if (typeof post?._searchText === "string" && post._searchText) {
      return post._searchText.includes(normalizedSearch);
    }

    if (!post || typeof post !== "object") {
      return false;
    }

    let searchText = postSearchTextCache.get(post);
    if (typeof searchText !== "string") {
      searchText = buildPostSearchText(post);
      postSearchTextCache.set(post, searchText);
    }

    return searchText.includes(normalizedSearch);
  });
}

function applyPostFilters(posts, { category = "", search = "" } = {}) {
  return filterPostsBySearch(
    filterPostsByCategory(posts, category),
    search,
  );
}

function normalizeBoundedQueryString(value, maxLength) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  const safeMaxLength = Math.max(0, Math.trunc(normalizeNonNegativeNumber(maxLength, 0)));
  return safeMaxLength > 0 ? trimmed.slice(0, safeMaxLength) : "";
}

function normalizePostQueryFilters({ category = "", search = "" } = {}) {
  return {
    category: normalizeBoundedQueryString(category, PUBLIC_CATEGORY_QUERY_MAX_LENGTH),
    search: normalizeBoundedQueryString(search, PUBLIC_SEARCH_QUERY_MAX_LENGTH),
  };
}

function hasPostQueryFilters(filters) {
  return Boolean(filters?.category || filters?.search);
}

async function getPublicPageSummaries({ operation } = {}) {
  const cacheTtlMs = PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS;
  if (cacheTtlMs > 0) {
    const cached = getCachedPublicPageSummaries();
    if (cached?.pages) {
      return cached.pages;
    }
  }

  return publicPageSummarySingleFlight.run(({ signal }) => runWithNotionOperation(async (sharedOperation) => {
    if (cacheTtlMs > 0) {
      const cachedDuringWait = getCachedPublicPageSummaries();
      if (cachedDuringWait?.pages) {
        return cachedDuringWait.pages;
      }
    }

    const metadata = await getDatabaseMetadata({ operation: sharedOperation });
    const pages = await queryDatabasePages({
      filter: metadata.publicAccessPolicy.filter,
      operation: sharedOperation,
      schema: metadata.contentSchema,
    });

    if (cacheTtlMs > 0) {
      throwIfOperationAborted(sharedOperation);
      publicPageQueryCache.clear();
      const nextSummaryCache = {
        pages,
        expiresAt: Date.now() + cacheTtlMs,
      };
      publicPageSummaryCache.set(nextSummaryCache, nextSummaryCache.expiresAt);
    } else {
      throwIfOperationAborted(sharedOperation);
      publicPageSummaryCache.clear();
      publicPageQueryCache.clear();
    }

    return pages;
  }, { signal }), { signal: operation?.signal });
}

async function loadPublicPagesForQuery(filters, { operation } = {}) {
  const cachedSummaries = getCachedPublicPageSummaries();
  if (cachedSummaries?.pages) {
    return cachedSummaries;
  }

  if (!hasPostQueryFilters(filters)) {
    const pages = await getPublicPageSummaries({ operation });
    return {
      pages,
      expiresAt: getCachedPublicPageSummaries()?.expiresAt || 0,
    };
  }

  const metadata = await getDatabaseMetadata({ operation });
  const categoryOptions = readCategorySelectOptions(metadata.database, metadata.contentSchema);
  const isKnownCategory = (
    !filters.category
    || filters.category === ALL_CATEGORY
    || categoryOptions.some((option) => option.name === filters.category)
  );
  if (!isKnownCategory) {
    const cacheTtlMs = PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS;
    return {
      pages: [],
      expiresAt: cacheTtlMs > 0 ? Date.now() + cacheTtlMs : 0,
    };
  }
  const categoryFilter = buildCategoryFilter(filters.category, metadata.contentSchema);
  if (!categoryFilter) {
    const pages = await getPublicPageSummaries({ operation });
    return {
      pages,
      expiresAt: getCachedPublicPageSummaries()?.expiresAt || 0,
    };
  }

  const pages = await queryDatabasePages({
    filter: combineDatabaseFilters([
      metadata.publicAccessPolicy.filter,
      categoryFilter,
    ]),
    operation,
    schema: metadata.contentSchema,
  });

  const cacheTtlMs = PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS;
  return {
    pages,
    expiresAt: cacheTtlMs > 0 ? Date.now() + cacheTtlMs : 0,
  };
}

async function queryPublicPages(query = {}, { operation, signal } = {}) {
  if (!operation) {
    return runWithNotionOperation((nextOperation) => queryPublicPages(query, {
      operation: nextOperation,
    }), { signal });
  }

  const filters = normalizePostQueryFilters(query);
  if (!hasPostQueryFilters(filters)) {
    const { pages } = await loadPublicPagesForQuery(filters, { operation });
    return pages;
  }

  const cacheKey = buildPublicPageQueryCacheKey(filters);
  const cachedPages = getCachedPublicPageQuery(cacheKey);
  if (cachedPages) {
    return applyPostFilters(cachedPages, filters);
  }

  const pages = await publicPageQuerySingleFlight.run(cacheKey, ({ signal: sharedSignal }) => (
    runWithNotionOperation(async (sharedOperation) => {
      const cachedDuringWait = getCachedPublicPageQuery(cacheKey);
      if (cachedDuringWait) return cachedDuringWait;
      const loaded = await loadPublicPagesForQuery(filters, { operation: sharedOperation });
      cachePublicPageQuery(cacheKey, loaded.pages, loaded.expiresAt, { operation: sharedOperation });
      return loaded.pages;
    }, { signal: sharedSignal })
  ), { signal: operation.signal });
  return applyPostFilters(pages, filters);
}

function normalizePositiveInteger(value, fallback) {
  const normalizedFallback = Number.isSafeInteger(Number(fallback)) && Number(fallback) > 0
    ? Number(fallback)
    : 1;
  const rawValue = String(value ?? "").trim();
  if (!/^\d+$/.test(rawValue)) {
    return normalizedFallback;
  }

  const parsed = Number(rawValue);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : normalizedFallback;
}

async function queryPublicPosts({
  category = "",
  search = "",
  page = 1,
  pageSize = DEFAULT_POST_PAGE_SIZE,
} = {}, { operation, signal } = {}) {
  if (!operation) {
    return runWithNotionOperation((nextOperation) => queryPublicPosts({
      category,
      search,
      page,
      pageSize,
    }, { operation: nextOperation }), { signal });
  }

  const metadata = await getDatabaseMetadata({ operation });
  const results = await queryPublicPages({ category, search }, { operation });
  const categoryOptions = readCategorySelectOptions(metadata.database, metadata.contentSchema);
  const categoryOptionLookup = buildCategoryOptionLookup(categoryOptions);
  const cachedSummaries = getCachedPublicPageSummaries()?.pages;
  const categories = buildPublicCategories({
    database: metadata.database,
    schema: metadata.contentSchema,
    posts: Array.isArray(cachedSummaries) ? cachedSummaries : results,
  });

  const safePageSize = Math.max(
    1,
    Math.min(normalizePositiveInteger(pageSize, DEFAULT_POST_PAGE_SIZE), 100),
  );
  const total = results.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = normalizePositiveInteger(page, 1);
  if (currentPage > totalPages) {
    const error = new Error("Requested post-list page is out of range");
    error.status = 404;
    error.code = "public_page_out_of_range";
    throw error;
  }
  const sliceStart = (currentPage - 1) * safePageSize;
  const pageResults = results
    .slice(sliceStart, sliceStart + safePageSize)
    .map((post) => decoratePostSummary(post, categoryOptionLookup));

  return {
    results: pageResults,
    total,
    totalPages,
    currentPage,
    categories,
  };
}

function buildPostPayload(summary, blocks) {
  const baseOrigin = getSiteOrigin();
  const mapped = blocks
    .map((block) => mapNotionBlock(block, { baseOrigin }))
    .filter(Boolean);

  return {
    ...summary,
    content: withBlockImageSignatures(mapped),
  };
}

function getPublicPostCacheKey(pageId) {
  const normalizedId = normalizeNotionId(pageId);
  if (normalizedId) {
    return normalizedId;
  }

  return typeof pageId === "string" ? pageId.trim() : String(pageId ?? "");
}

function getCachedPublicPost(cacheKey) {
  return publicPostCache.get(cacheKey);
}

function cachePublicPost(cacheKey, data, { operation } = {}) {
  throwIfOperationAborted(operation);
  publicPostCache.set(cacheKey, data, Date.now() + PUBLIC_POST_CACHE_TTL_MS);
}

function getPendingPublicPostRequest(cacheKey) {
  return pendingPublicPostRequests.get(cacheKey);
}

function withPendingPublicPostRequest(cacheKey, loader) {
  return pendingPublicPostRequests.run(cacheKey, loader);
}

async function fetchPublicPost(pageId, { signal } = {}) {
  if (signal?.aborted) {
    throw signal.reason || createAbortError("Post request aborted", "post_request_aborted");
  }
  const cacheKey = getPublicPostCacheKey(pageId);
  const cached = getCachedPublicPost(cacheKey);
  if (cached) return cached;

  return pendingPublicPostRequests.subscribe(cacheKey, ({ signal: sharedSignal }) => (
    runWithNotionOperation(async (operation) => {
      const cachedDuringWait = getCachedPublicPost(cacheKey);
      if (cachedDuringWait) {
        return cachedDuringWait;
      }

      const [page, metadata] = await Promise.all([
        requestNotionJson(
          `/pages/${encodeNotionPathId(pageId)}`,
          getNotionRequestOptions(operation),
        ),
        getDatabaseMetadata({ operation }),
      ]);
      const publicPage = assertPublicPage(page, metadata.publicAccessPolicy);
      const categoryOptions = readCategorySelectOptions(metadata.database, metadata.contentSchema);
      const categoryOptionLookup = buildCategoryOptionLookup(categoryOptions);
      const summary = withCoverImageSignature(decoratePostSummary(mapNotionPage(publicPage, {
        includeSearchText: true,
        schema: metadata.contentSchema,
      }), categoryOptionLookup));
      const blocks = await fetchAllBlockChildren(
        publicPage.id,
        0,
        undefined,
        getNotionRequestOptions(operation),
      );
      const post = buildPostPayload(summary, blocks);
      cachePublicPost(cacheKey, post, { operation });
      return post;
    }, { signal: sharedSignal })
  ), { signal });
}

const CACHE_SWEEP_INTERVAL_MS = 300_000;

function sweepExpiredCacheEntries() {
  const now = Date.now();
  publicPostCache.sweep(now);
  publicPageQueryCache.sweep(now);
  databaseMetadataCache.sweep(now);
  publicPageSummaryCache.sweep(now);
}

function shouldStartCacheSweepTimer() {
  return typeof setInterval === "function" && process.env.VERCEL !== "1";
}

if (shouldStartCacheSweepTimer()) {
  const cacheSweepTimer = setInterval(sweepExpiredCacheEntries, CACHE_SWEEP_INTERVAL_MS);
  if (typeof cacheSweepTimer.unref === "function") {
    cacheSweepTimer.unref();
  }
}

module.exports = {
  CACHE_SWEEP_INTERVAL_MS,
  DATABASE_METADATA_TTL_MS,
  DEFAULT_POST_PAGE_SIZE,
  NOTION_SINGLE_FLIGHT_ERROR_COOLDOWN_MS,
  PUBLIC_PAGE_QUERY_CACHE_MAX_ENTRIES,
  PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS,
  PUBLIC_POST_CACHE_MAX_ENTRIES,
  PUBLIC_POST_CACHE_TTL_MS,
  PUBLIC_SEARCH_QUERY_MAX_LENGTH,
  applyPostFilters,
  buildCategoryPresentation,
  buildPostPayload,
  buildPublicCategories,
  buildPublicPageQueryCacheKey,
  cachePublicPageQuery,
  decoratePostSummary,
  fetchPublicPost,
  filterPostsByCategory,
  filterPostsBySearch,
  getCachedDatabaseMetadata,
  getCachedPublicPageQuery,
  getCachedPublicPageSummaries,
  getCachedPublicPost,
  getDatabaseMetadata,
  getPendingPublicPostRequest,
  getPublicPageSummaries,
  getPublicPostCacheKey,
  hasPostQueryFilters,
  loadPublicPagesForQuery,
  normalizeBoundedQueryString,
  normalizePositiveInteger,
  normalizePostQueryFilters,
  queryDatabasePages,
  queryPublicPages,
  queryPublicPosts,
  shouldStartCacheSweepTimer,
  sortPostsByDateDesc,
  sweepExpiredCacheEntries,
  throwIfOperationAborted,
  withPendingPublicPostRequest,
};
