/**
 * Starts the first public-list request before the heavier rendering chain is
 * ready. The resolved JSON is consumed exactly once by notion-api.js.
 */

const ALL_CATEGORY = "全部";
const BOOKMARK_HASH_PREFIX = "#bookmarks";
const CATEGORY_MAX_LENGTH = 128;
const SEARCH_MAX_LENGTH = 256;
// Keep this synchronized with notion-api.js and above the server's complete
// NOTION_OPERATION_TIMEOUT_MS default, because bootstrap owns the initial fetch.
const PUBLIC_CONTENT_REQUEST_TIMEOUT_MS = 35000;

function normalizeBoundedString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizePage(value) {
  const rawValue = String(value ?? "").trim();
  if (!/^\d+$/.test(rawValue)) return 1;
  const parsed = Number(rawValue);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function buildRequestUrl(rawUrl) {
  const pageUrl = new URL(rawUrl || window.location.href, window.location.href);
  if (pageUrl.origin !== window.location.origin) return "";
  if (pageUrl.hash === BOOKMARK_HASH_PREFIX || pageUrl.hash.startsWith(`${BOOKMARK_HASH_PREFIX}?`)) {
    return "";
  }

  const category = normalizeBoundedString(pageUrl.searchParams.get("category"), CATEGORY_MAX_LENGTH);
  const search = normalizeBoundedString(pageUrl.searchParams.get("search"), SEARCH_MAX_LENGTH);
  const page = normalizePage(pageUrl.searchParams.get("page"));
  const params = new URLSearchParams();

  if (category && category !== ALL_CATEGORY) params.set("category", category);
  if (search) params.set("search", search);
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return `/api/posts-data${query ? `?${query}` : ""}`;
}

function createAbortBridge(externalSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) {
    abort();
  } else {
    externalSignal?.addEventListener?.("abort", abort, { once: true });
  }

  return {
    controller,
    cleanup() {
      externalSignal?.removeEventListener?.("abort", abort);
    },
  };
}

function createTimeoutError() {
  const error = new Error("Notion API request timed out");
  error.status = 504;
  return error;
}

function requestInitialData(requestUrl, controller) {
  const request = fetch(requestUrl, {
    headers: { Accept: "application/json" },
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      // Preserve the same server diagnostics as the full API client. The
      // bootstrap response is consumed directly, so dropping these fields
      // would turn configuration/permission errors into a generic failure.
      const payload = typeof response.json === "function"
        ? await response.json().catch(() => null)
        : null;
      if (payload && typeof payload === "object") {
        for (const key of ["code", "notionCode"]) {
          if (typeof payload[key] === "string") error[key] = payload[key];
        }
        error.detail = [payload.detail, payload.message, payload.error]
          .find((value) => typeof value === "string" && value) || "";
      }
      error.retryAfter = response.headers?.get?.("retry-after") || "";
      throw error;
    }
    return response.json();
  });

  let timeoutId = null;
  const deadline = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      const error = createTimeoutError();
      reject(error);
      controller.abort(error);
    }, PUBLIC_CONTENT_REQUEST_TIMEOUT_MS);
  });

  return Promise.race([request, deadline]).finally(() => {
    clearTimeout(timeoutId);
  });
}

const bootstrapState = window.PageBootstrap || (window.PageBootstrap = {});

function ensure(rawUrl = window.location.href, { signal } = {}) {
  const requestUrl = buildRequestUrl(rawUrl);
  if (!requestUrl) return null;

  const existing = bootstrapState.blogInitialData;
  if (
    existing?.requestUrl === requestUrl
    && existing.promise
    && !existing.consumed
    && !existing.failed
    && !existing.controller?.signal?.aborted
  ) {
    return existing;
  }

  if (existing && !existing.settled) {
    existing.controller?.abort?.();
  }

  const abortBridge = createAbortBridge(signal);
  const entry = {
    requestUrl,
    startedAt: Date.now(),
    controller: abortBridge.controller,
    settled: false,
    failed: false,
    consumed: false,
    promise: null,
  };

  entry.promise = requestInitialData(requestUrl, abortBridge.controller);

  entry.promise.then(() => {
    entry.settled = true;
    abortBridge.cleanup();
  }, () => {
    entry.settled = true;
    entry.failed = true;
    abortBridge.cleanup();
  });
  // See app.js: the consumer may not be installed until the rendering modules
  // finish evaluating, so observe early failures without changing the promise.
  entry.promise.catch(() => {});

  bootstrapState.blogInitialData = entry;
  return entry;
}

window.BlogBootstrap = Object.freeze({
  buildRequestUrl,
  ensure,
});

if (document.body?.dataset?.page === "blog") {
  ensure(window.location.href);
}
