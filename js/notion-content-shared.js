(function (root, factory) {
  const exported = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else if (root) {
    root.NotionContentShared = exported;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const ALL_CATEGORY = "\u5168\u90e8";
  const BOOKMARK_CATEGORY = "\u6536\u85cf";
  const DEFAULT_SITE_NAME = "Share Everything";
  // Single source of truth for the OpenGraph share image path. Bump the v= query
  // string to cache-bust; consumers (HTML files via inject-site-meta.mjs, SSR
  // helpers, and runtime JS) read this constant instead of hardcoding the path.
  const DEFAULT_SHARE_IMAGE_PATH = "/og-image.jpg?v=4";
  const FEATURED_CATEGORY_DEFINITIONS = Object.freeze([
    Object.freeze({
      name: "\u7cbe\u9009",
      emoji: "\u{1f31f}",
      color: "pink",
      cardColor: Object.freeze({
        bg: "rgba(255, 64, 129, 0.1)",
        color: "#ff4081",
        border: "rgba(255, 64, 129, 0.2)",
      }),
      gradient: "linear-gradient(135deg, #3b0a45, #6d1a7e)",
    }),
  ]);
  const REMOTE_BLOG_CATEGORIES = Object.freeze([
    Object.freeze({ name: ALL_CATEGORY, emoji: "\u{1f4cb}", color: "cyan" }),
    ...FEATURED_CATEGORY_DEFINITIONS.map(({ name, emoji, color }) => Object.freeze({ name, emoji, color })),
  ]);
  const BOOKMARK_ONLY_CATEGORIES = Object.freeze([
    Object.freeze({ name: BOOKMARK_CATEGORY, emoji: "\u{1f4da}" }),
  ]);
  const SUPPORTED_BLOG_CATEGORIES = Object.freeze([
    ...REMOTE_BLOG_CATEGORIES.map((category) => category.name),
    BOOKMARK_CATEGORY,
  ]);
  const CATEGORY_COLORS = Object.freeze(
    FEATURED_CATEGORY_DEFINITIONS.reduce((colors, definition) => {
      colors[definition.name] = definition.cardColor;
      return colors;
    }, {}),
  );
  const CATEGORY_GRADIENTS = Object.freeze(
    FEATURED_CATEGORY_DEFINITIONS.reduce((gradients, definition) => {
      gradients[definition.name] = definition.gradient;
      return gradients;
    }, {}),
  );
  const DEFAULT_CATEGORY_COLOR = Object.freeze({
    bg: "rgba(0, 229, 255, 0.1)",
    color: "#00e5ff",
    border: "rgba(0, 229, 255, 0.2)",
  });
  const DEFAULT_COVER_GRADIENT = "linear-gradient(135deg, #1a1a2e, #16213e)";
  const CALENDAR_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>'
    + '<line x1="16" y1="2" x2="16" y2="6"></line>'
    + '<line x1="8" y1="2" x2="8" y2="6"></line>'
    + '<line x1="3" y1="10" x2="21" y2="10"></line>'
    + "</svg>";
  const CLOCK_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<circle cx="12" cy="12" r="10"></circle>'
    + '<polyline points="12 6 12 12 16 14"></polyline>'
    + "</svg>";

  function getRemoteBlogCategories() {
    return REMOTE_BLOG_CATEGORIES.slice();
  }

  function getBookmarkOnlyCategories() {
    return BOOKMARK_ONLY_CATEGORIES.slice();
  }

  function getSupportedBlogCategories() {
    return SUPPORTED_BLOG_CATEGORIES.slice();
  }

  function gradientForCategory(category) {
    return CATEGORY_GRADIENTS[category] || DEFAULT_COVER_GRADIENT;
  }

  function getCategoryColor(category) {
    return CATEGORY_COLORS[category] || DEFAULT_CATEGORY_COLOR;
  }

  return Object.freeze({
    ALL_CATEGORY,
    BOOKMARK_CATEGORY,
    BOOKMARK_ONLY_CATEGORIES,
    CALENDAR_ICON_SVG,
    CATEGORY_COLORS,
    CATEGORY_GRADIENTS,
    CLOCK_ICON_SVG,
    DEFAULT_CATEGORY_COLOR,
    DEFAULT_COVER_GRADIENT,
    DEFAULT_SHARE_IMAGE_PATH,
    DEFAULT_SITE_NAME,
    FEATURED_CATEGORY_DEFINITIONS,
    REMOTE_BLOG_CATEGORIES,
    SUPPORTED_BLOG_CATEGORIES,
    getBookmarkOnlyCategories,
    getCategoryColor,
    getRemoteBlogCategories,
    getSupportedBlogCategories,
    gradientForCategory,
  });
});
