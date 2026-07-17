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
const MAX_NOTION_OPERATION_TIMEOUT_MS = 30_000;
const NOTION_OPERATION_TIMEOUT_MS = Math.min(
  MAX_NOTION_OPERATION_TIMEOUT_MS,
  normalizePositiveNumber(process.env.NOTION_OPERATION_TIMEOUT_MS, MAX_NOTION_OPERATION_TIMEOUT_MS),
);

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

function parseNotionPaginationResponse(data, { resourceType = "" } = {}) {
  const isObject = data !== null && typeof data === "object" && !Array.isArray(data);
  const hasMore = isObject ? data.has_more : undefined;
  const nextCursor = isObject ? data.next_cursor : undefined;
  const hasValidNextCursor = typeof nextCursor === "string" && nextCursor.trim() !== "";
  const hasUnexpectedTerminalCursor = !hasMore && nextCursor !== null && nextCursor !== undefined;

  if (
    !isObject
    || !Array.isArray(data.results)
    || typeof hasMore !== "boolean"
    || (hasMore && !hasValidNextCursor)
    || hasUnexpectedTerminalCursor
  ) {
    throw createNotionRequestError("Notion API returned an invalid pagination response", {
      status: 502,
      code: "notion_invalid_response",
      resourceType,
    });
  }

  return {
    results: data.results,
    nextCursor: hasMore ? nextCursor : null,
  };
}

function createNotionAbortError(message, code) {
  const error = new Error(message);
  error.name = "AbortError";
  error.code = code;
  return error;
}

function createNotionOperation({ timeoutMs = NOTION_OPERATION_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const safeTimeoutMs = Math.min(
    MAX_NOTION_OPERATION_TIMEOUT_MS,
    Math.max(1, Math.trunc(normalizePositiveNumber(timeoutMs, NOTION_OPERATION_TIMEOUT_MS))),
  );
  const deadlineAt = Date.now() + safeTimeoutMs;
  const timeoutId = setTimeout(() => {
    controller.abort(createNotionRequestError("Notion operation timed out", {
      status: 504,
      code: "notion_timeout_error",
    }));
  }, safeTimeoutMs);

  return {
    deadlineAt,
    signal: controller.signal,
    abort(reason = createNotionAbortError("Notion operation aborted", "notion_operation_aborted")) {
      if (!controller.signal.aborted) controller.abort(reason);
    },
    dispose() {
      clearTimeout(timeoutId);
    },
  };
}

async function requestNotionJson(path, init = {}) {
  const notionToken = getNotionToken();
  const {
    deadlineAt: requestedDeadlineValue,
    signal: externalSignal,
    ...requestInit
  } = init;
  const requestedDeadline = Number(requestedDeadlineValue);
  const deadlineRemainingMs = Number.isFinite(requestedDeadline)
    ? Math.max(0, requestedDeadline - Date.now())
    : Number.POSITIVE_INFINITY;
  if (externalSignal?.aborted) {
    const abortReason = externalSignal.reason;
    if (abortReason?.code === "notion_timeout_error") throw abortReason;
    throw abortReason || createNotionAbortError("Notion request aborted", "notion_request_aborted");
  }
  if (deadlineRemainingMs <= 0) {
    throw createNotionRequestError("Notion operation timed out", {
      status: 504,
      code: "notion_timeout_error",
      resourceType: getNotionResourceType(path),
    });
  }

  const controller = new AbortController();
  let didRequestTimeout = false;
  const effectiveTimeoutMs = Math.max(1, Math.min(
    NOTION_REQUEST_TIMEOUT_MS,
    deadlineRemainingMs,
  ));
  const onExternalAbort = () => controller.abort(
    externalSignal.reason || createNotionAbortError("Notion request aborted", "notion_request_aborted"),
  );
  externalSignal?.addEventListener?.("abort", onExternalAbort, { once: true });
  const timeoutId = setTimeout(() => {
    didRequestTimeout = true;
    controller.abort(createNotionAbortError(
      "Notion API request timed out",
      "notion_request_timeout",
    ));
  }, effectiveTimeoutMs);

  try {
    let response;
    try {
      response = await fetch(`${NOTION_BASE}${path}`, {
        ...requestInit,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
          ...(requestInit.headers || {}),
        },
      });
    } catch (error) {
      if (error?.name === "AbortError" || controller.signal.aborted) {
        throw error;
      }

      throw createNotionRequestError("Failed to reach Notion API", {
        status: 502,
        code: "notion_network_error",
        resourceType: getNotionResourceType(path),
        cause: error,
      });
    }

    if (!response.ok) {
      let rawDetail = "";
      try {
        rawDetail = await response.text();
      } catch (error) {
        if (error?.name === "AbortError" || controller.signal.aborted) {
          throw error;
        }
      }

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

    // Await the body while the abort timer is still active. Fetch resolving
    // only means response headers arrived; a stalled body must not hold a
    // serverless invocation indefinitely.
    try {
      return await response.json();
    } catch (error) {
      if (error?.name === "AbortError" || controller.signal.aborted) {
        throw error;
      }
      if (error?.name !== "SyntaxError") {
        throw createNotionRequestError("Failed to read Notion API response", {
          status: 502,
          code: "notion_network_error",
          resourceType: getNotionResourceType(path),
          cause: error,
        });
      }
      throw createNotionRequestError("Notion API returned invalid JSON", {
        status: 502,
        code: "notion_invalid_response",
        resourceType: getNotionResourceType(path),
        cause: error,
      });
    }
  } catch (error) {
    if (error?.name === "AbortError" || controller.signal.aborted) {
      const abortReason = controller.signal.reason;
      if (!didRequestTimeout) throw abortReason || error;
      throw createNotionRequestError("Notion API request timed out", {
        status: 504,
        code: "notion_timeout_error",
        resourceType: getNotionResourceType(path),
        cause: error,
      });
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener?.("abort", onExternalAbort);
  }
}

module.exports = {
  CONFIGURED_SITE_ORIGIN,
  DEFAULT_SITE_ORIGIN,
  MAX_NOTION_OPERATION_TIMEOUT_MS,
  NOTION_BASE,
  NOTION_OPERATION_TIMEOUT_MS,
  NOTION_REQUEST_TIMEOUT_MS,
  NOTION_VERSION,
  SITE_CONFIG,
  createNotionRequestError,
  createNotionOperation,
  getDatabaseId,
  getNotionResourceType,
  getNotionToken,
  getSiteOrigin,
  parseNotionPaginationResponse,
  requestNotionJson,
};
