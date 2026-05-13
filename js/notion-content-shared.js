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
    CATEGORY_COLORS,
    CATEGORY_GRADIENTS,
    DEFAULT_CATEGORY_COLOR,
    DEFAULT_COVER_GRADIENT,
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
