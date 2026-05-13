const {
  buildArticleStructuredData: buildSharedArticleStructuredData,
  renderBlocks,
} = require("../js/notion-content");
const { getSiteOrigin } = require("./notion-client");

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
    defaultShareImageUrl: `${siteOrigin}/favicon.png?v=4`,
    baseOrigin: siteOrigin,
  });
}

module.exports = {
  buildArticleStructuredData,
  buildPostUrl,
  buildSharedArticleStructuredData,
  renderPostContent,
};
