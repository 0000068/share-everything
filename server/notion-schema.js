const {
  DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES,
  resolveNotionContentSchema,
} = require("../js/notion-content");
const { ALL_CATEGORY } = require("./category-navigation");
const { readCsvEnv } = require("./notion-config");

const CONTENT_PROPERTY_ENV_NAMES = Object.freeze({
  title: ["NOTION_TITLE_PROPERTY_NAMES", "NOTION_TITLE_PROPERTY_NAME"],
  excerpt: ["NOTION_EXCERPT_PROPERTY_NAMES", "NOTION_EXCERPT_PROPERTY_NAME"],
  readTime: ["NOTION_READ_TIME_PROPERTY_NAMES", "NOTION_READ_TIME_PROPERTY_NAME"],
  tags: ["NOTION_TAGS_PROPERTY_NAMES", "NOTION_TAGS_PROPERTY_NAME"],
  category: ["NOTION_CATEGORY_PROPERTY_NAMES", "NOTION_CATEGORY_PROPERTY_NAME"],
  date: ["NOTION_DATE_PROPERTY_NAMES", "NOTION_DATE_PROPERTY_NAME"],
});

function combineDatabaseFilters(filters) {
  const activeFilters = filters.filter(Boolean);
  if (activeFilters.length === 0) {
    return null;
  }
  if (activeFilters.length === 1) {
    return activeFilters[0];
  }
  return {
    and: activeFilters,
  };
}

function getContentPropertyCandidates(field) {
  return readCsvEnv(
    CONTENT_PROPERTY_ENV_NAMES[field] || [],
    DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES[field] || [],
  );
}

function buildContentSchema(database) {
  const candidateOverrides = {};
  Object.keys(DEFAULT_NOTION_CONTENT_PROPERTY_CANDIDATES).forEach((field) => {
    candidateOverrides[field] = getContentPropertyCandidates(field);
  });

  return resolveNotionContentSchema(database, candidateOverrides);
}

function buildDatabaseSorts(schema) {
  if (schema?.date?.name && schema.date.type === "date") {
    return [{
      property: schema.date.name,
      direction: "descending",
    }];
  }

  return null;
}

function buildCategoryFilter(category, schema) {
  const normalizedCategory = typeof category === "string" ? category.trim() : "";
  if (!normalizedCategory || normalizedCategory === ALL_CATEGORY) {
    return null;
  }

  if (!schema?.category?.name || schema.category.type !== "select") {
    return null;
  }

  return {
    property: schema.category.name,
    select: { equals: normalizedCategory },
  };
}

module.exports = {
  CONTENT_PROPERTY_ENV_NAMES,
  buildCategoryFilter,
  buildContentSchema,
  buildDatabaseSorts,
  combineDatabaseFilters,
  getContentPropertyCandidates,
};
