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
  getDatabaseId,
  getSiteOrigin,
  requestNotionJson,
  SITE_CONFIG,
} = require("./notion-client");
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
  createPendingRequestMap,
  createSingleFlight,
  createTtlSlot,
} = require("./cache-store");

const DEFAULT_POST_PAGE_SIZE = 9;
const PUBLIC_SEARCH_QUERY_MAX_LENGTH = 256;
const DATABASE_METADATA_TTL_MS = normalizeNonNegativeNumber(process.env.DATABASE_METADATA_TTL_MS, 300_000);
const PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS = normalizeNonNegativeNumber(process.env.PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS, 120_000);
const PUBLIC_PAGE_QUERY_CACHE_MAX_ENTRIES = 24;
const PUBLIC_POST_CACHE_TTL_MS = normalizeNonNegativeNumber(process.env.PUBLIC_POST_CACHE_TTL_MS, 60_000);
const PUBLIC_POST_CACHE_MAX_ENTRIES = 20;
const CATEGORY_NAVIGATION = createCategoryNavigation(SITE_CONFIG?.categoryNavigation);
const {
  buildCategoryPresentation,
  buildPublicCategories,
  decoratePostSummary,
} = CATEGORY_NAVIGATION;
const POST_SEARCH_TEXT_SYMBOL = Symbol("postSearchText");

const databaseMetadataCache = createTtlSlot();
const databaseMetadataSingleFlight = createSingleFlight();
const publicPageQueryCache = createLruTtlCache({ maxEntries: PUBLIC_PAGE_QUERY_CACHE_MAX_ENTRIES });
const publicPageSummaryCache = createTtlSlot({
  onExpire: () => publicPageQueryCache.clear(),
});
const publicPageSummarySingleFlight = createSingleFlight();
const publicPostCache = createLruTtlCache({ maxEntries: PUBLIC_POST_CACHE_MAX_ENTRIES });
const pendingPublicPostRequests = createPendingRequestMap();

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
    search: normalizeSearchText(normalizedFilters.search),
  });
}

function getCachedPublicPageQuery(cacheKey) {
  return publicPageQueryCache.get(cacheKey, {
    clone: (pages) => (Array.isArray(pages) ? pages.slice() : null),
  });
}

function cachePublicPageQuery(cacheKey, pages, expiresAt) {
  if (!Array.isArray(pages)) {
    return;
  }

  publicPageQueryCache.set(cacheKey, pages.slice(), expiresAt);
}

async function getDatabaseMetadata() {
  const cached = getCachedDatabaseMetadata();
  if (cached?.publicAccessPolicy) {
    return cached;
  }

  return databaseMetadataSingleFlight.run(async () => {
    const cachedDuringWait = getCachedDatabaseMetadata();
    if (cachedDuringWait?.publicAccessPolicy) {
      return cachedDuringWait;
    }

    const database = await requestNotionJson(`/databases/${encodeNotionPathId(getDatabaseId())}`);
    const publicAccessPolicy = buildPublicAccessPolicyFromDatabase();
    const contentSchema = buildContentSchema(database);
    const nextMetadata = {
      database,
      contentSchema,
      publicAccessPolicy,
      expiresAt: Date.now() + DATABASE_METADATA_TTL_MS,
    };
    databaseMetadataCache.set(nextMetadata, nextMetadata.expiresAt);
    return nextMetadata;
  });
}

async function queryDatabasePages({ filter, schema = null } = {}) {
  const databaseId = encodeNotionPathId(getDatabaseId());
  const pages = [];
  let startCursor = null;
  let rounds = 0;
  const sorts = buildDatabaseSorts(schema);

  do {
    if (++rounds > MAX_PAGINATION_ROUNDS) {
      console.warn(`Database query pagination exceeded ${MAX_PAGINATION_ROUNDS} rounds, stopping.`);
      break;
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
      method: "POST",
      body: JSON.stringify(body),
    });

    pages.push(...data.results);
    startCursor = data.has_more ? data.next_cursor : null;
  } while (startCursor);

  const mappedPages = pages.map((page) => mapNotionPage(page, {
    includeSearchText: true,
    schema,
  }));
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

    if (typeof post !== "object" || post == null) {
      return buildPostSearchText(post).includes(normalizedSearch);
    }

    if (typeof post[POST_SEARCH_TEXT_SYMBOL] !== "string") {
      const searchText = buildPostSearchText(post);
      try {
        Object.defineProperty(post, POST_SEARCH_TEXT_SYMBOL, {
          value: searchText,
          configurable: true,
        });
      } catch {
        return searchText.includes(normalizedSearch);
      }
    }

    return post[POST_SEARCH_TEXT_SYMBOL].includes(normalizedSearch);
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

async function getPublicPageSummaries() {
  const cacheTtlMs = normalizeNonNegativeNumber(PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS, 15_000);
  if (cacheTtlMs > 0) {
    const cached = getCachedPublicPageSummaries();
    if (cached?.pages) {
      return cached.pages;
    }
  }

  return publicPageSummarySingleFlight.run(async () => {
    if (cacheTtlMs > 0) {
      const cachedDuringWait = getCachedPublicPageSummaries();
      if (cachedDuringWait?.pages) {
        return cachedDuringWait.pages;
      }
    }

    const metadata = await getDatabaseMetadata();
    const pages = await queryDatabasePages({
      filter: metadata.publicAccessPolicy.filter,
      schema: metadata.contentSchema,
    });

    if (cacheTtlMs > 0) {
      publicPageQueryCache.clear();
      const nextSummaryCache = {
        pages,
        expiresAt: Date.now() + cacheTtlMs,
      };
      publicPageSummaryCache.set(nextSummaryCache, nextSummaryCache.expiresAt);
    } else {
      publicPageSummaryCache.clear();
      publicPageQueryCache.clear();
    }

    return pages;
  });
}

async function loadPublicPagesForQuery(filters) {
  const cachedSummaries = getCachedPublicPageSummaries();
  if (cachedSummaries?.pages) {
    return cachedSummaries;
  }

  if (!hasPostQueryFilters(filters)) {
    const pages = await getPublicPageSummaries();
    return {
      pages,
      expiresAt: getCachedPublicPageSummaries()?.expiresAt || 0,
    };
  }

  const metadata = await getDatabaseMetadata();
  const categoryFilter = buildCategoryFilter(filters.category, metadata.contentSchema);
  if (!categoryFilter) {
    const pages = await getPublicPageSummaries();
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
    schema: metadata.contentSchema,
  });

  const cacheTtlMs = normalizeNonNegativeNumber(PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS, 15_000);
  return {
    pages,
    expiresAt: cacheTtlMs > 0 ? Date.now() + cacheTtlMs : 0,
  };
}

async function queryPublicPages(query = {}) {
  const filters = normalizePostQueryFilters(query);
  if (!hasPostQueryFilters(filters)) {
    const { pages } = await loadPublicPagesForQuery(filters);
    return pages;
  }

  const cacheKey = buildPublicPageQueryCacheKey(filters);
  const cachedPages = getCachedPublicPageQuery(cacheKey);
  if (cachedPages) {
    return cachedPages;
  }

  const { pages, expiresAt } = await loadPublicPagesForQuery(filters);
  const filteredPages = applyPostFilters(pages, filters);
  cachePublicPageQuery(cacheKey, filteredPages, expiresAt);
  return filteredPages;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function queryPublicPosts({
  category = "",
  search = "",
  page = 1,
  pageSize = DEFAULT_POST_PAGE_SIZE,
} = {}) {
  const metadata = await getDatabaseMetadata();
  const results = await queryPublicPages({ category, search });
  const categoryOptions = readCategorySelectOptions(metadata.database, metadata.contentSchema);
  const categoryOptionLookup = buildCategoryOptionLookup(categoryOptions);
  const cachedSummaries = getCachedPublicPageSummaries()?.pages;
  const categories = buildPublicCategories({
    database: metadata.database,
    schema: metadata.contentSchema,
    posts: Array.isArray(cachedSummaries) ? cachedSummaries : results,
  });
  const decoratedResults = results.map((post) => decoratePostSummary(post, categoryOptionLookup));

  const safePageSize = Math.max(
    1,
    Math.min(normalizePositiveInteger(pageSize, DEFAULT_POST_PAGE_SIZE), 100),
  );
  const total = decoratedResults.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.max(1, Math.min(normalizePositiveInteger(page, 1), totalPages));
  const sliceStart = (currentPage - 1) * safePageSize;

  return {
    results: decoratedResults.slice(sliceStart, sliceStart + safePageSize),
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
    content: mapped,
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

function cachePublicPost(cacheKey, data) {
  publicPostCache.set(cacheKey, data, Date.now() + PUBLIC_POST_CACHE_TTL_MS);
}

function getPendingPublicPostRequest(cacheKey) {
  return pendingPublicPostRequests.get(cacheKey);
}

function withPendingPublicPostRequest(cacheKey, loader) {
  return pendingPublicPostRequests.run(cacheKey, loader);
}

async function fetchPublicPost(pageId) {
  const cacheKey = getPublicPostCacheKey(pageId);
  const cached = getCachedPublicPost(cacheKey);
  if (cached) return cached;

  return withPendingPublicPostRequest(cacheKey, async () => {
    const cachedDuringWait = getCachedPublicPost(cacheKey);
    if (cachedDuringWait) {
      return cachedDuringWait;
    }

    const [page, metadata] = await Promise.all([
      requestNotionJson(`/pages/${encodeNotionPathId(pageId)}`),
      getDatabaseMetadata(),
    ]);
    const publicPage = assertPublicPage(page, metadata.publicAccessPolicy);
    const categoryOptions = readCategorySelectOptions(metadata.database, metadata.contentSchema);
    const categoryOptionLookup = buildCategoryOptionLookup(categoryOptions);
    const summary = decoratePostSummary(mapNotionPage(publicPage, {
      includeSearchText: true,
      schema: metadata.contentSchema,
    }), categoryOptionLookup);
    const blocks = await fetchAllBlockChildren(publicPage.id);
    const post = buildPostPayload(summary, blocks);
    cachePublicPost(cacheKey, post);
    return post;
  });
}

const CACHE_SWEEP_INTERVAL_MS = 300_000;

function sweepExpiredCacheEntries() {
  const now = Date.now();
  publicPostCache.sweep(now);
  publicPageQueryCache.sweep(now);
  databaseMetadataCache.sweep(now);
  publicPageSummaryCache.sweep(now);
}

if (typeof setInterval === "function") {
  const cacheSweepTimer = setInterval(sweepExpiredCacheEntries, CACHE_SWEEP_INTERVAL_MS);
  if (typeof cacheSweepTimer.unref === "function") {
    cacheSweepTimer.unref();
  }
}

module.exports = {
  CACHE_SWEEP_INTERVAL_MS,
  DATABASE_METADATA_TTL_MS,
  DEFAULT_POST_PAGE_SIZE,
  POST_SEARCH_TEXT_SYMBOL,
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
  sortPostsByDateDesc,
  sweepExpiredCacheEntries,
  withPendingPublicPostRequest,
};
