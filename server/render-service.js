const {
  buildArticleStructuredData: buildSharedArticleStructuredData,
  renderBlocks,
} = require("../js/notion-content");
const { getSiteOrigin } = require("./notion-client");
const { getSiteName } = require("./notion-config");

function renderPostContent(postOrBlocks, { baseOrigin = getSiteOrigin() } = {}) {
  const content = Array.isArray(postOrBlocks)
    ? postOrBlocks
    : Array.isArray(postOrBlocks?.content)
      ? postOrBlocks.content
      : [];

  return renderBlocks(content, { baseOrigin });
}

function buildPostUrl(pageId) {
  return `${getSiteOrigin()}/posts/${encodeURIComponent(pageId)}`;
}

function buildArticleStructuredData(post) {
  const siteOrigin = getSiteOrigin();

  return buildSharedArticleStructuredData(post, {
    canonicalUrl: buildPostUrl(post.id),
    defaultShareImageUrl: `${siteOrigin}/og-image.jpg?v=4`,
    siteName: getSiteName(),
    baseOrigin: siteOrigin,
  });
}

module.exports = {
  buildArticleStructuredData,
  buildPostUrl,
  buildSharedArticleStructuredData,
  renderPostContent,
};
