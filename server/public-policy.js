const {
  createNotionRequestError,
  getDatabaseId,
} = require("./notion-client");
const {
  normalizeName,
  normalizeNotionId,
} = require("./notion-config");

function buildDatabaseWidePublicAccessPolicy() {
  return {
    propertyName: "",
    propertyType: "database",
    allowedStatusValues: [],
    filter: null,
  };
}

function buildPublicAccessPolicyFromDatabase() {
  return buildDatabaseWidePublicAccessPolicy();
}

function isPageInPublicDatabase(page) {
  return normalizeNotionId(page?.parent?.database_id) === normalizeNotionId(getDatabaseId());
}

function isPagePublicByPolicy(page, publicAccessPolicy) {
  if (publicAccessPolicy?.propertyType === "database") {
    return true;
  }

  const property = page?.properties?.[publicAccessPolicy.propertyName];
  const normalizedAllowedValues = publicAccessPolicy.allowedStatusValues.map(normalizeName);

  if (publicAccessPolicy.propertyType === "checkbox") {
    return property?.checkbox === true;
  }

  if (publicAccessPolicy.propertyType === "status") {
    return normalizedAllowedValues.includes(normalizeName(property?.status?.name));
  }

  if (publicAccessPolicy.propertyType === "select") {
    return normalizedAllowedValues.includes(normalizeName(property?.select?.name));
  }

  return false;
}

function assertPublicPage(page, publicAccessPolicy) {
  if (isPageInPublicDatabase(page) && isPagePublicByPolicy(page, publicAccessPolicy)) {
    return page;
  }

  throw createNotionRequestError("Notion page is not public", {
    status: 404,
    code: "notion_page_not_public",
  });
}

module.exports = {
  assertPublicPage,
  buildDatabaseWidePublicAccessPolicy,
  buildPublicAccessPolicyFromDatabase,
  isPageInPublicDatabase,
  isPagePublicByPolicy,
};
