/**
 * Starts the first public-list request before the heavier rendering chain is
 * ready. The resolved JSON is consumed exactly once by notion-api.js.
 */

const ALL_CATEGORY = "全部";
const BOOKMARK_HASH_PREFIX = "#bookmarks";
const CATEGORY_MAX_LENGTH = 128;
const SEARCH_MAX_LENGTH = 256;
const MAX_PAGE = 10_000;
const COVER_SIZES = "(max-width: 768px) 50vw, (max-width: 900px) 100vw, (max-width: 1200px) 50vw, 400px";
const COVER_SIG_RE = /^[A-Za-z0-9_-]{43}$/;
const COVER_WIDTHS = [320, 640, 960];
const EAGER_COVER_PRELOAD_COUNT = 3;
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
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= MAX_PAGE ? parsed : 1;
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

function coverUrlFor(src, sig, width) {
  const url = new URL("/api/cover", window.location.origin);
  url.searchParams.set("format", "webp");
  url.searchParams.set("src", src);
  url.searchParams.set("sig", sig);
  url.searchParams.set("w", String(width));
  return url.href;
}

function resolveCoverPreload(post) {
  const raw = typeof post?.coverImage === "string" ? post.coverImage.trim() : "";
  if (!raw) return null;
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.username || parsed.password) return null;
    if (parsed.origin === window.location.origin) return { href: parsed.href, srcSet: "" };
    if (parsed.protocol !== "https:") return null;
    parsed.hash = "";
    const sig = typeof post.coverImageSignature === "string" ? post.coverImageSignature.trim() : "";
    if (!COVER_SIG_RE.test(sig)) return { href: parsed.href, srcSet: "" };
    return {
      href: coverUrlFor(parsed.href, sig, 640),
      srcSet: COVER_WIDTHS.map((w) => `${coverUrlFor(parsed.href, sig, w)} ${w}w`).join(", "),
    };
  } catch {
    return null;
  }
}

function prewarmCoverImages(payload) {
  if (!Array.isArray(payload?.results) || !document?.head?.appendChild || typeof document?.createElement !== "function") return [];
  const limit = window.navigator?.connection?.saveData ? 1 : EAGER_COVER_PRELOAD_COUNT;
  const existing = new Set(
    Array.from(document.head.querySelectorAll?.('link[data-blog-cover-preload="true"]') || [])
      .map((node) => node?.href || node?.getAttribute?.("href") || "")
      .filter(Boolean),
  );
  const batchSeen = new Set();
  const created = [];
  let count = 0;
  for (const post of payload.results) {
    if (count >= limit) break;
    const spec = resolveCoverPreload(post);
    if (!spec || batchSeen.has(spec.href)) continue;
    batchSeen.add(spec.href);
    const priority = count++ === 0 ? "high" : "auto";
    if (existing.has(spec.href)) continue;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = spec.href;
    if (spec.srcSet) {
      link.imageSrcset = spec.srcSet;
      link.imageSizes = COVER_SIZES;
      link.setAttribute?.("imagesrcset", spec.srcSet);
      link.setAttribute?.("imagesizes", COVER_SIZES);
    }
    link.fetchPriority = priority;
    link.setAttribute?.("fetchpriority", priority);
    if (link.dataset) link.dataset.blogCoverPreload = "true";
    link.setAttribute?.("data-blog-cover-preload", "true");
    document.head.appendChild(link);
    created.push(link);
  }
  return created;
}

const bootstrapState = window.PageBootstrap || (window.PageBootstrap = {});

function ensure(rawUrl = window.location.href, { signal } = {}) {
  const requestUrl = buildRequestUrl(rawUrl);
  if (!requestUrl) return null;
  if (window.NotionAPI?.hasCachedPosts?.(requestUrl)) return null;

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

  entry.promise.then((payload) => {
    entry.settled = true;
    abortBridge.cleanup();
    if (abortBridge.controller.signal.aborted || signal?.aborted) return;
    let created = [];
    try {
      created = prewarmCoverImages(payload);
    } catch {
      return;
    }
    if (created.length > 0 && signal?.addEventListener) {
      signal.addEventListener("abort", () => {
        if (entry.consumed) return;
        created.forEach((link) => link.remove?.());
        if (bootstrapState.blogInitialData === entry) {
          bootstrapState.blogInitialData = null;
        }
      }, { once: true });
    }
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
