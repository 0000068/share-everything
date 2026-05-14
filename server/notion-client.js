const {
  SAFE_FALLBACK_SITE_ORIGIN,
  normalizePositiveNumber,
  normalizeSiteOrigin,
  readConfiguredSiteOrigin,
  readSiteConfig,
} = require("./notion-config");

const NOTION_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const SITE_CONFIG = readSiteConfig();
const CONFIGURED_SITE_ORIGIN = readConfiguredSiteOrigin(SITE_CONFIG);
const DEFAULT_SITE_ORIGIN = normalizeSiteOrigin(
  process.env.SITE_URL,
  CONFIGURED_SITE_ORIGIN || SAFE_FALLBACK_SITE_ORIGIN,
);
const NOTION_REQUEST_TIMEOUT_MS = normalizePositiveNumber(process.env.NOTION_REQUEST_TIMEOUT_MS, 12_000);

function getNotionToken() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw createNotionRequestError("NOTION_TOKEN is not configured", {
      status: 500,
      code: "notion_config_error",
    });
  }
  return token;
}

function getDatabaseId() {
  const id = process.env.NOTION_DATABASE_ID;
  if (!id) {
    throw createNotionRequestError("NOTION_DATABASE_ID is not configured", {
      status: 500,
      code: "notion_config_error",
    });
  }
  return id;
}

function getSiteOrigin() {
  return DEFAULT_SITE_ORIGIN;
}

function createNotionRequestError(message, {
  status = 500,
  code = "notion_request_error",
  notionCode = "",
  detail = "",
  retryAfter = "",
  resourceType = "",
  cause,
} = {}) {
  const error = new Error(message);
  error.name = "NotionRequestError";
  error.status = status;
  error.code = code;
  error.notionCode = notionCode;
  error.detail = detail;
  error.retryAfter = retryAfter;
  error.resourceType = resourceType;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

function getNotionResourceType(path) {
  const normalizedPath = String(path || "");
  if (normalizedPath.startsWith("/databases/")) {
    return "database";
  }
  if (normalizedPath.startsWith("/pages/")) {
    return "page";
  }
  if (normalizedPath.startsWith("/blocks/")) {
    return "block";
  }
  return "";
}

async function requestNotionJson(path, init = {}) {
  const notionToken = getNotionToken();

  let response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NOTION_REQUEST_TIMEOUT_MS);

  try {
    response = await fetch(`${NOTION_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createNotionRequestError("Notion API request timed out", {
        status: 504,
        code: "notion_timeout_error",
        resourceType: getNotionResourceType(path),
        cause: error,
      });
    }

    throw createNotionRequestError("Failed to reach Notion API", {
      status: 502,
      code: "notion_network_error",
      resourceType: getNotionResourceType(path),
      cause: error,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const rawDetail = await response.text().catch(() => "");
    let detail = rawDetail;
    let notionCode = "";
    const retryAfter = response.headers.get("retry-after") || "";

    if (rawDetail) {
      try {
        const parsedDetail = JSON.parse(rawDetail);
        if (typeof parsedDetail?.message === "string" && parsedDetail.message) {
          detail = parsedDetail.message;
        }
        if (typeof parsedDetail?.code === "string" && parsedDetail.code) {
          notionCode = parsedDetail.code;
        }
      } catch {
        // Keep the raw response body when it is not JSON.
      }
    }

    throw createNotionRequestError(`Notion API error: ${response.status}${detail ? ` ${detail}` : ""}`, {
      status: response.status,
      code: "notion_api_error",
      notionCode,
      detail: detail || rawDetail,
      retryAfter,
      resourceType: getNotionResourceType(path),
    });
  }

  return response.json();
}

module.exports = {
  CONFIGURED_SITE_ORIGIN,
  DEFAULT_SITE_ORIGIN,
  NOTION_BASE,
  NOTION_REQUEST_TIMEOUT_MS,
  NOTION_VERSION,
  SITE_CONFIG,
  createNotionRequestError,
  getDatabaseId,
  getNotionResourceType,
  getNotionToken,
  getSiteOrigin,
  requestNotionJson,
};
