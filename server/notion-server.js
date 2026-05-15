// This file is the public compatibility surface for `api/*` and the smoke-check
// harness. Several `require` destructures below pull symbols that are NOT
// re-exported below — they are used by `loadCommonJsModule(.., [list])` in
// scripts/smoke-check.mjs and scripts/smoke-check/* to bind closure-internal
// helpers for testing. Do not delete unused imports as "dead code"; the harness
// loses access to them, and the smoke suite fails opaquely.

const {
  buildArticleStructuredData,
  buildPostUrl,
  buildSharedArticleStructuredData,
  renderPostContent,
} = require("./render-service");
const {
  escapeHtml,
  getCategoryColor,
  renderPostArticle,
  resolveShareImageUrl,
} = require("../js/notion-content");
const {
  NOTION_REQUEST_TIMEOUT_MS,
  createNotionRequestError,
  getDatabaseId,
  getNotionResourceType,
  getSiteOrigin,
  requestNotionJson,
} = require("./notion-client");
const {
  getSiteName,
} = require("./notion-config");
const {
  buildCategoryFilter,
  buildContentSchema,
  buildDatabaseSorts,
  combineDatabaseFilters,
  getContentPropertyCandidates,
} = require("./notion-schema");
const {
  buildDatabaseWidePublicAccessPolicy,
  buildPublicAccessPolicyFromDatabase,
  assertPublicPage,
  isPageInPublicDatabase,
  isPagePublicByPolicy,
} = require("./public-policy");
const {
  MAX_BLOCK_RECURSION_DEPTH,
  MAX_PAGINATION_ROUNDS,
  fetchAllBlockChildren,
  runWithBlockChildConcurrency,
} = require("./block-service");
const {
  DATABASE_METADATA_TTL_MS,
  DEFAULT_POST_PAGE_SIZE,
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
  normalizePostQueryFilters,
  queryDatabasePages,
  queryPublicPages,
  queryPublicPosts,
  sortPostsByDateDesc,
  sweepExpiredCacheEntries,
  withPendingPublicPostRequest,
} = require("./post-service");

module.exports = {
  buildArticleStructuredData,
  buildCategoryPresentation,
  buildPublicCategories,
  buildPostUrl,
  decoratePostSummary,
  escapeHtml,
  fetchPublicPost,
  getDatabaseId,
  getCategoryColor,
  getSiteName,
  getSiteOrigin,
  queryPublicPages,
  queryPublicPosts,
  renderPostArticle,
  renderPostContent,
  resolveShareImageUrl,
};
