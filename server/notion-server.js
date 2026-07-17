// Stable compatibility surface consumed by the public API handlers. Focused
// implementation and test helpers live in their owning server modules.
const {
  buildArticleStructuredData,
  buildPostPath,
  buildPostUrl,
  renderPostContent,
} = require("./render-service");
const {
  escapeHtml,
  getCategoryColor,
  renderPostArticle,
  resolveShareImageUrl,
} = require("../js/notion-content");
const {
  getDatabaseId,
  getSiteOrigin,
} = require("./notion-client");
const { getSiteName } = require("./notion-config");
const {
  PUBLIC_SEARCH_QUERY_MAX_LENGTH,
  buildCategoryPresentation,
  buildPublicCategories,
  decoratePostSummary,
  fetchPublicPost,
  queryPublicPages,
  queryPublicPosts,
} = require("./post-service");
const {
  ALL_CATEGORY,
  PUBLIC_CATEGORY_QUERY_MAX_LENGTH,
} = require("./category-navigation");

module.exports = {
  ALL_CATEGORY,
  buildArticleStructuredData,
  buildCategoryPresentation,
  buildPublicCategories,
  buildPostPath,
  buildPostUrl,
  decoratePostSummary,
  escapeHtml,
  fetchPublicPost,
  getCategoryColor,
  getDatabaseId,
  getSiteName,
  getSiteOrigin,
  PUBLIC_CATEGORY_QUERY_MAX_LENGTH,
  PUBLIC_SEARCH_QUERY_MAX_LENGTH,
  queryPublicPages,
  queryPublicPosts,
  renderPostArticle,
  renderPostContent,
  resolveShareImageUrl,
};
