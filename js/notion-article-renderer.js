(function (root, factory) {
  const sharedContent = typeof module === "object" && module.exports
    ? require("./notion-content-shared")
    : root?.NotionContentShared;
  const exported = factory(sharedContent || {});

  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else if (root) {
    root.NotionArticleRenderer = exported;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, (sharedContent = {}) => {
  const { CALENDAR_ICON_SVG, CLOCK_ICON_SVG } = sharedContent;

  if (typeof CALENDAR_ICON_SVG !== "string" || typeof CLOCK_ICON_SVG !== "string") {
    throw new Error("notion-content-shared.js must load before notion-article-renderer.js");
  }

  function createPostArticleRenderer({
    DEFAULT_CATEGORY_COLOR,
    escapeHtml,
    getCategoryColor,
    renderBlocks,
    sanitizeCssColorValue,
  } = {}) {
    if (
      !DEFAULT_CATEGORY_COLOR ||
      typeof escapeHtml !== "function" ||
      typeof getCategoryColor !== "function" ||
      typeof renderBlocks !== "function" ||
      typeof sanitizeCssColorValue !== "function"
    ) {
      throw new Error("createPostArticleRenderer requires content rendering dependencies");
    }

    function renderPostTags(tags) {
      if (!Array.isArray(tags) || tags.length === 0) {
        return "";
      }

      const tagItems = tags
        .map((tag) => `<span class="post-tag">#${escapeHtml(tag)}</span>`)
        .join(" ");

      return `<span class="post-tags" aria-label="\u6807\u7b7e">${tagItems}</span>`;
    }

    function renderPostArticle(post, { baseOrigin, renderedContent } = {}) {
      const category = post?.category || "";
      const categoryLabel = post?.categoryLabel || category;
      const date = post?.date || "";
      const readTime = post?.readTime || "";
      const categoryColor = post?.categoryColor || getCategoryColor(category);
      const metaItems = [];
      const articleContent = typeof renderedContent === "string"
        ? renderedContent
        : renderBlocks(Array.isArray(post?.content) ? post.content : [], { baseOrigin });

      if (date) {
        metaItems.push(`<span>${CALENDAR_ICON_SVG}${escapeHtml(date)}</span>`);
      }

      if (readTime) {
        metaItems.push(`<span>${CLOCK_ICON_SVG}${escapeHtml(readTime)}</span>`);
      }

      const tagHtml = renderPostTags(post?.tags);
      if (tagHtml) {
        metaItems.push(tagHtml);
      }

      const categoryHtml = category
        ? `
            <div class="post-category" style="background: ${sanitizeCssColorValue(categoryColor.bg, DEFAULT_CATEGORY_COLOR.bg)}; color: ${sanitizeCssColorValue(categoryColor.color, DEFAULT_CATEGORY_COLOR.color)}; border: 1px solid ${sanitizeCssColorValue(categoryColor.border, DEFAULT_CATEGORY_COLOR.border)};">
              ${escapeHtml(categoryLabel)}
            </div>
      `
        : "";
      const metaHtml = metaItems.length > 0
        ? `
            <div class="post-meta">
              ${metaItems.join("")}
            </div>
      `
        : "";

      return `
          <div class="post-header">
            ${categoryHtml}
            <h1 class="post-title" data-page-focus>${escapeHtml(post?.title || "")}</h1>
            ${metaHtml}
          </div>
          <div class="post-content">
            ${articleContent}
          </div>
  `;
    }

    return Object.freeze({
      renderPostArticle,
      renderPostTags,
    });
  }

  return Object.freeze({
    CALENDAR_ICON_SVG,
    CLOCK_ICON_SVG,
    createPostArticleRenderer,
  });
});
