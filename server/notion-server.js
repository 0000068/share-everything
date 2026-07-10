// Stable compatibility surface consumed by the public API handlers. Focused
// implementation and test helpers live in their owning server modules.
const {
  buildArticleStructuredData,
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
  buildCategoryPresentation,
  buildPublicCategories,
  decoratePostSummary,
  fetchPublicPost,
  queryPublicPages,
  queryPublicPosts,
} = require("./post-service");

module.exports = {
  buildArticleStructuredData,
  buildCategoryPresentation,
  buildPublicCategories,
  buildPostUrl,
  decoratePostSummary,
  escapeHtml,
  fetchPublicPost,
  getCategoryColor,
  getDatabaseId,
  getSiteName,
  getSiteOrigin,
  queryPublicPages,
  queryPublicPosts,
  renderPostArticle,
  renderPostContent,
  resolveShareImageUrl,
};
