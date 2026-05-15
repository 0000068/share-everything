const {
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_COVER_GRADIENT,
} = require("../js/notion-content-shared");
const { sanitizeCssColorValue } = require("../js/notion-content-utils");
const { normalizeName } = require("./notion-config");

const PUBLIC_CATEGORY_QUERY_MAX_LENGTH = 128;
const ALL_CATEGORY = "\u5168\u90e8";
const BOOKMARK_CATEGORY = "\u6536\u85cf";
const DEFAULT_FEATURED_CATEGORY_NAME = "\u7cbe\u9009";

const CATEGORY_FALLBACK_STYLES = Object.freeze([
  Object.freeze({
    emoji: "\u{1f3f7}\ufe0f",
    color: "cyan",
    cardColor: Object.freeze({ bg: "rgba(0, 229, 255, 0.1)", color: "#00e5ff", border: "rgba(0, 229, 255, 0.2)" }),
    gradient: "linear-gradient(135deg, #09313a, #0b5864)",
  }),
  Object.freeze({
    emoji: "\u{1f4a1}",
    color: "blue",
    cardColor: Object.freeze({ bg: "rgba(41, 121, 255, 0.1)", color: "#2979ff", border: "rgba(41, 121, 255, 0.2)" }),
    gradient: "linear-gradient(135deg, #0d1b4b, #1a3a6b)",
  }),
  Object.freeze({
    emoji: "\u{1f4da}",
    color: "green",
    cardColor: Object.freeze({ bg: "rgba(0, 230, 118, 0.1)", color: "#00e676", border: "rgba(0, 230, 118, 0.2)" }),
    gradient: "linear-gradient(135deg, #0a2e1a, #1a5c35)",
  }),
  Object.freeze({
    emoji: "\u2728",
    color: "purple",
    cardColor: Object.freeze({ bg: "rgba(213, 0, 249, 0.1)", color: "#d500f9", border: "rgba(213, 0, 249, 0.2)" }),
    gradient: "linear-gradient(135deg, #1a0a3b, #3d1a7e)",
  }),
  Object.freeze({
    emoji: "\u{1f9ed}",
    color: "orange",
    cardColor: Object.freeze({ bg: "rgba(255, 171, 0, 0.1)", color: "#ffab00", border: "rgba(255, 171, 0, 0.2)" }),
    gradient: "linear-gradient(135deg, #2e1a00, #5c3800)",
  }),
  Object.freeze({
    emoji: "\u{1f4f7}",
    color: "pink",
    cardColor: Object.freeze({ bg: "rgba(255, 64, 129, 0.1)", color: "#ff4081", border: "rgba(255, 64, 129, 0.2)" }),
    gradient: "linear-gradient(135deg, #3b0a45, #6d1a7e)",
  }),
  Object.freeze({
    emoji: "\u{1f9ea}",
    color: "teal",
    cardColor: Object.freeze({ bg: "rgba(38, 198, 218, 0.1)", color: "#26c6da", border: "rgba(38, 198, 218, 0.2)" }),
    gradient: "linear-gradient(135deg, #06333b, #0d6874)",
  }),
  Object.freeze({
    emoji: "\u{1f9f0}",
    color: "amber",
    cardColor: Object.freeze({ bg: "rgba(255, 193, 7, 0.1)", color: "#ffc107", border: "rgba(255, 193, 7, 0.2)" }),
    gradient: "linear-gradient(135deg, #2d2400, #725900)",
  }),
  Object.freeze({
    emoji: "\u{1f4dd}",
    color: "indigo",
    cardColor: Object.freeze({ bg: "rgba(92, 107, 192, 0.1)", color: "#8c9eff", border: "rgba(140, 158, 255, 0.2)" }),
    gradient: "linear-gradient(135deg, #111a44, #293a8f)",
  }),
  Object.freeze({
    emoji: "\u{1f52d}",
    color: "violet",
    cardColor: Object.freeze({ bg: "rgba(156, 39, 176, 0.1)", color: "#ce93d8", border: "rgba(206, 147, 216, 0.2)" }),
    gradient: "linear-gradient(135deg, #2b0a38, #5e1a7a)",
  }),
  Object.freeze({
    emoji: "\u{1f3af}",
    color: "rose",
    cardColor: Object.freeze({ bg: "rgba(244, 67, 54, 0.1)", color: "#ff8a80", border: "rgba(255, 138, 128, 0.2)" }),
    gradient: "linear-gradient(135deg, #3a0f16, #7a1f31)",
  }),
  Object.freeze({
    emoji: "\u{1f9e9}",
    color: "lime",
    cardColor: Object.freeze({ bg: "rgba(174, 213, 129, 0.1)", color: "#aed581", border: "rgba(174, 213, 129, 0.2)" }),
    gradient: "linear-gradient(135deg, #1f3310, #4c6f1f)",
  }),
]);

const NOTION_COLOR_STYLE_INDEX = Object.freeze({
  blue: 1,
  green: 2,
  purple: 3,
  orange: 4,
  yellow: 4,
  pink: 5,
  red: 5,
  gray: 0,
  brown: 4,
  default: 0,
});

function normalizeCategoryName(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.slice(0, PUBLIC_CATEGORY_QUERY_MAX_LENGTH);
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map(normalizeCategoryName).filter(Boolean)
    : [];
}

function normalizeStringMap(value) {
  const map = new Map();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return map;
  }

  Object.entries(value).forEach(([key, entryValue]) => {
    const normalizedKey = normalizeName(normalizeCategoryName(key));
    const normalizedValue = normalizeCategoryName(entryValue);
    if (normalizedKey && normalizedValue) {
      map.set(normalizedKey, normalizedValue);
    }
  });

  return map;
}

function normalizeCategoryGradient(value, fallback = DEFAULT_COVER_GRADIENT) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (trimmed.includes(";") || /url\s*\(/i.test(trimmed)) return fallback;
  if (/^(linear-gradient|radial-gradient)\([#0-9a-zA-Z,.\s%()-]+\)$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function normalizeCategoryColorConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const bg = sanitizeCssColorValue(value.bg || value.background, "");
  const color = sanitizeCssColorValue(value.color || value.text || value.fg, "");
  const border = sanitizeCssColorValue(value.border || value.borderColor, "");
  const gradient = normalizeCategoryGradient(value.gradient, "");

  if (!bg && !color && !border && !gradient) {
    return null;
  }

  return {
    ...(bg || color || border
      ? {
        cardColor: {
          bg: bg || DEFAULT_CATEGORY_COLOR.bg,
          color: color || DEFAULT_CATEGORY_COLOR.color,
          border: border || DEFAULT_CATEGORY_COLOR.border,
        },
      }
      : {}),
    ...(gradient ? { gradient } : {}),
  };
}

function normalizeCategoryColorMap(value) {
  const map = new Map();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return map;
  }

  Object.entries(value).forEach(([key, entryValue]) => {
    const normalizedKey = normalizeName(normalizeCategoryName(key));
    const normalizedValue = normalizeCategoryColorConfig(entryValue);
    if (normalizedKey && normalizedValue) {
      map.set(normalizedKey, normalizedValue);
    }
  });

  return map;
}

function normalizeCategoryNavigationConfig(rawConfig = {}) {
  const raw = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  const rawFeatured = raw.featured && typeof raw.featured === "object" ? raw.featured : {};
  const featuredName = normalizeCategoryName(rawFeatured.name) || DEFAULT_FEATURED_CATEGORY_NAME;
  const order = normalizeStringArray(raw.order);
  const featuredOrder = order.some((name) => normalizeName(name) === normalizeName(featuredName))
    ? order
    : [featuredName, ...order];

  return {
    featuredName,
    featuredLabel: normalizeCategoryName(rawFeatured.label) || featuredName,
    featuredEmoji: normalizeCategoryName(rawFeatured.emoji) || "\u{1f31f}",
    featuredColor: normalizeCategoryColorConfig(rawFeatured.color) || normalizeCategoryColorConfig(rawFeatured),
    order: featuredOrder,
    displayNames: normalizeStringMap(raw.displayNames || raw.labels),
    emojis: normalizeStringMap(raw.emojis),
    colors: normalizeCategoryColorMap(raw.colors),
  };
}

function findDatabaseProperty(database, schemaEntry) {
  const properties = database?.properties || {};
  if (schemaEntry?.name && properties[schemaEntry.name]) {
    return properties[schemaEntry.name];
  }

  if (schemaEntry?.id) {
    return Object.values(properties).find((entry) => normalizeName(entry?.id) === normalizeName(schemaEntry.id)) || null;
  }

  return null;
}

function readCategorySelectOptions(database, schema) {
  if (!schema?.category || schema.category.type !== "select") {
    return [];
  }

  const property = findDatabaseProperty(database, schema.category);
  const options = property?.select?.options;
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((option, index) => ({
      name: normalizeCategoryName(option?.name),
      notionColor: normalizeName(option?.color) || "default",
      optionIndex: index,
    }))
    .filter((option) => option.name);
}

function buildCategoryOptionLookup(categoryOptions = []) {
  const lookup = new Map();
  categoryOptions.forEach((option) => {
    const key = normalizeName(option?.name);
    if (key && !lookup.has(key)) {
      lookup.set(key, option);
    }
  });
  return lookup;
}

function hashCategoryName(name) {
  return String(name || "").split("").reduce((hash, char) => (
    ((hash << 5) - hash + char.charCodeAt(0)) | 0
  ), 0);
}

function getFallbackCategoryStyleIndex(name, notionColor = "") {
  const colorKey = normalizeName(notionColor);
  const indexedColor = NOTION_COLOR_STYLE_INDEX[colorKey];
  if (Number.isInteger(indexedColor) && CATEGORY_FALLBACK_STYLES[indexedColor]) {
    return indexedColor;
  }

  return Math.abs(hashCategoryName(name)) % CATEGORY_FALLBACK_STYLES.length;
}

function getFallbackCategoryStyle(name, notionColor = "") {
  return CATEGORY_FALLBACK_STYLES[getFallbackCategoryStyleIndex(name, notionColor)] || CATEGORY_FALLBACK_STYLES[0];
}

function getUnusedFallbackCategoryEmoji(name, notionColor = "", usedEmojis = null) {
  const firstIndex = getFallbackCategoryStyleIndex(name, notionColor);
  const fallback = CATEGORY_FALLBACK_STYLES[firstIndex] || CATEGORY_FALLBACK_STYLES[0];
  if (!usedEmojis || !usedEmojis.has(fallback.emoji)) {
    return fallback.emoji;
  }

  for (let offset = 1; offset < CATEGORY_FALLBACK_STYLES.length; offset += 1) {
    const candidate = CATEGORY_FALLBACK_STYLES[(firstIndex + offset) % CATEGORY_FALLBACK_STYLES.length];
    if (candidate?.emoji && !usedEmojis.has(candidate.emoji)) {
      return candidate.emoji;
    }
  }

  return fallback.emoji;
}

function createCategoryNavigation(rawConfig = {}) {
  const config = normalizeCategoryNavigationConfig(rawConfig);

  function getConfiguredCategoryPresentation(name) {
    const key = normalizeName(name);
    const isFeatured = key === normalizeName(config.featuredName);
    const colorConfig = isFeatured
      ? config.featuredColor
      : config.colors.get(key);

    return {
      label: isFeatured
        ? config.featuredLabel
        : config.displayNames.get(key),
      emoji: isFeatured
        ? config.featuredEmoji
        : config.emojis.get(key),
      ...(colorConfig || {}),
    };
  }

  function buildCategoryPresentation(name, {
    notionColor = "default",
    optionIndex = Number.POSITIVE_INFINITY,
    usedEmojis = null,
  } = {}) {
    const normalizedName = normalizeCategoryName(name);
    const fallback = getFallbackCategoryStyle(normalizedName, notionColor);
    const configured = getConfiguredCategoryPresentation(normalizedName);
    const cardColor = configured.cardColor || fallback.cardColor || DEFAULT_CATEGORY_COLOR;
    const gradient = configured.gradient || fallback.gradient || DEFAULT_COVER_GRADIENT;
    const fallbackEmoji = getUnusedFallbackCategoryEmoji(normalizedName, notionColor, usedEmojis);

    return {
      name: normalizedName,
      label: configured.label || normalizedName,
      emoji: configured.emoji || fallbackEmoji || "\u{1f3f7}\ufe0f",
      color: fallback.color || notionColor || "default",
      categoryColor: {
        bg: cardColor.bg || DEFAULT_CATEGORY_COLOR.bg,
        color: cardColor.color || DEFAULT_CATEGORY_COLOR.color,
        border: cardColor.border || DEFAULT_CATEGORY_COLOR.border,
      },
      coverGradient: gradient,
      optionIndex,
    };
  }

  function buildPublicCategories({ database, schema, posts = [] } = {}) {
    const categoryOptions = readCategorySelectOptions(database, schema);
    const byKey = new Map();
    const addCategory = (name, details = {}) => {
      const normalizedName = normalizeCategoryName(name);
      const key = normalizeName(normalizedName);
      if (!key || normalizedName === ALL_CATEGORY || normalizedName === BOOKMARK_CATEGORY) {
        return;
      }

      const existing = byKey.get(key);
      byKey.set(key, {
        name: existing?.name || normalizedName,
        notionColor: existing?.notionColor || details.notionColor || "default",
        optionIndex: Math.min(
          Number.isFinite(existing?.optionIndex) ? existing.optionIndex : Number.POSITIVE_INFINITY,
          Number.isFinite(details.optionIndex) ? details.optionIndex : Number.POSITIVE_INFINITY,
        ),
      });
    };

    addCategory(config.featuredName, {
      notionColor: "pink",
      optionIndex: -1,
    });

    categoryOptions.forEach((option) => addCategory(option.name, option));
    posts.forEach((post, index) => addCategory(post?.category, {
      optionIndex: categoryOptions.length + index,
    }));

    const orderLookup = new Map(
      config.order.map((name, index) => [normalizeName(name), index]),
    );
    const featuredKey = normalizeName(config.featuredName);
    const configuredLabelFor = (entry) => (
      getConfiguredCategoryPresentation(entry.name).label || normalizeCategoryName(entry.name)
    );
    const sortableEntries = Array.from(byKey.values())
      .map((entry) => ({
        entry,
        sortKey: normalizeName(entry.name),
        label: configuredLabelFor(entry),
      }))
      .sort((left, right) => {
        if (left.sortKey === featuredKey) return -1;
        if (right.sortKey === featuredKey) return 1;

        const leftOrder = orderLookup.has(left.sortKey) ? orderLookup.get(left.sortKey) : Number.POSITIVE_INFINITY;
        const rightOrder = orderLookup.has(right.sortKey) ? orderLookup.get(right.sortKey) : Number.POSITIVE_INFINITY;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        const leftIndex = Number.isFinite(left.entry.optionIndex) ? left.entry.optionIndex : Number.POSITIVE_INFINITY;
        const rightIndex = Number.isFinite(right.entry.optionIndex) ? right.entry.optionIndex : Number.POSITIVE_INFINITY;
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return left.label.localeCompare(right.label, "zh-Hans-CN");
      });
    const usedCategoryEmojis = new Set(["\u{1f4cb}"]);
    const categoryItems = sortableEntries.map(({ entry }) => {
      const { optionIndex, ...item } = buildCategoryPresentation(entry.name, {
        ...entry,
        usedEmojis: usedCategoryEmojis,
      });
      if (item.emoji) {
        usedCategoryEmojis.add(item.emoji);
      }
      return item;
    });

    return [
      {
        name: ALL_CATEGORY,
        label: ALL_CATEGORY,
        emoji: "\u{1f4cb}",
        color: "cyan",
        categoryColor: DEFAULT_CATEGORY_COLOR,
        coverGradient: DEFAULT_COVER_GRADIENT,
      },
      ...categoryItems,
    ];
  }

  function decoratePostSummary(post, categoryOptionLookup = new Map()) {
    if (!post?.category) {
      return post;
    }

    const option = categoryOptionLookup.get(normalizeName(post.category));
    const presentation = buildCategoryPresentation(post.category, option || {});
    return {
      ...post,
      categoryLabel: presentation.label,
      categoryColor: presentation.categoryColor,
      coverGradient: presentation.coverGradient || post.coverGradient,
    };
  }

  return {
    buildCategoryPresentation,
    buildPublicCategories,
    config,
    decoratePostSummary,
  };
}

module.exports = {
  ALL_CATEGORY,
  BOOKMARK_CATEGORY,
  DEFAULT_FEATURED_CATEGORY_NAME,
  PUBLIC_CATEGORY_QUERY_MAX_LENGTH,
  buildCategoryOptionLookup,
  createCategoryNavigation,
  normalizeCategoryName,
  normalizeCategoryNavigationConfig,
  readCategorySelectOptions,
};
