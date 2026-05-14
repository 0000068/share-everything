(function (root, factory) {
  const exported = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else if (root) {
    root.NotionContentUtils = exported;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES = Object.freeze({
    title: Object.freeze(["Name", "Title", "\u6807\u9898"]),
    excerpt: Object.freeze(["Excerpt", "Summary", "Description", "\u6458\u8981"]),
    readTime: Object.freeze(["ReadTime", "Read Time", "Reading Time", "\u9605\u8bfb\u65f6\u95f4", "\u9605\u8bfb\u65f6\u957f"]),
    tags: Object.freeze(["Tags", "Tag", "\u6807\u7b7e"]),
    category: Object.freeze(["Category", "\u5206\u7c7b"]),
    date: Object.freeze(["Date", "Published At", "Publish Date", "\u53d1\u5e03\u65e5\u671f", "\u53d1\u5e03\u65f6\u95f4"]),
  });

  const NOTION_CONTENT_PROPERTY_TYPES = Object.freeze({
    title: Object.freeze(["title"]),
    excerpt: Object.freeze(["rich_text"]),
    readTime: Object.freeze(["rich_text"]),
    tags: Object.freeze(["multi_select"]),
    category: Object.freeze(["select"]),
    date: Object.freeze(["date"]),
  });

  function sanitizeCssColorValue(value, fallback) {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
    if (/^(rgba?|hsla?)\([0-9,.\s%]+\)$/i.test(trimmed)) return trimmed;
    return fallback;
  }

  function getBaseOrigin(baseOrigin) {
    if (typeof baseOrigin === "string" && baseOrigin.trim()) {
      return baseOrigin.trim().replace(/\/+$/, "");
    }

    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin;
    }

    return "http://localhost";
  }

  function escapeHtml(value) {
    if (value == null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeName(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  }

  function normalizeSearchText(value) {
    return String(value ?? "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
  }

  function normalizePostTags(tags) {
    if (!Array.isArray(tags)) return [];

    return tags
      .map((tag) => String(tag ?? "").trim())
      .filter(Boolean);
  }

  function buildPostSearchText(post = {}) {
    return normalizeSearchText([
      typeof post?.title === "string" ? post.title : "",
      typeof post?.excerpt === "string" ? post.excerpt : "",
      ...normalizePostTags(post?.tags),
    ].join(" "));
  }

  function normalizeCandidates(value, fallback = []) {
    if (Array.isArray(value)) {
      return value.map((candidate) => String(candidate).trim()).filter(Boolean);
    }

    return normalizeCandidates(fallback, []);
  }

  function findPropertyEntry(properties, candidates, allowedTypes) {
    const entries = Object.values(properties || {});
    const normalizedCandidates = normalizeCandidates(candidates);
    const allowedTypeSet = new Set(normalizeCandidates(allowedTypes));

    for (const candidate of normalizedCandidates) {
      const normalizedCandidate = normalizeName(candidate);
      const match = entries.find((entry) => {
        if (allowedTypeSet.size > 0 && !allowedTypeSet.has(normalizeName(entry?.type))) {
          return false;
        }

        return normalizedCandidate === normalizeName(entry?.name) || normalizedCandidate === normalizeName(entry?.id);
      });

      if (match) {
        return {
          id: match.id || "",
          name: match.name || "",
          type: match.type || "",
        };
      }
    }

    return null;
  }

  function resolveNotionContentSchema(database, candidateOverrides = {}) {
    const properties = database?.properties || {};
    const schema = {};

    Object.entries(DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES).forEach(([field, defaults]) => {
      schema[field] = findPropertyEntry(
        properties,
        normalizeCandidates(candidateOverrides[field], defaults),
        NOTION_CONTENT_PROPERTY_TYPES[field] || [],
      );
    });

    return schema;
  }

  function getPageProperty(page, schemaEntry, fallbackCandidates = []) {
    const properties = page?.properties || {};
    if (schemaEntry?.name && properties[schemaEntry.name]) {
      return properties[schemaEntry.name];
    }

    if (schemaEntry?.id) {
      const byId = Object.values(properties).find((entry) => normalizeName(entry?.id) === normalizeName(schemaEntry.id));
      if (byId) {
        return byId;
      }
    }

    const fallbackEntry = findPropertyEntry(properties, fallbackCandidates, []);
    return fallbackEntry?.name ? properties[fallbackEntry.name] || null : null;
  }

  return {
    DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES,
    buildPostSearchText,
    escapeHtml,
    getBaseOrigin,
    getPageProperty,
    normalizeName,
    normalizeSearchText,
    normalizePostTags,
    resolveNotionContentSchema,
    sanitizeCssColorValue,
  };
});
