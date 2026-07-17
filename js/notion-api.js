/**
 * notion-api.js — Notion API 集成层（客户端）
 */

(() => {
  const NotionAPI = (() => {
    const CONFIG = {
      postsEndpoint: "/api/posts-data",
      postEndpoint: "/api/post-data",
      pageSize: 9,
    };
    // Stay above the server's complete Notion operation budget (30s by default),
    // not merely one upstream request, so valid multi-page/block traversals can
    // finish and populate shared caches before the browser gives up.
    const PUBLIC_CONTENT_REQUEST_TIMEOUT_MS = 35000;
    const POST_SUMMARY_CACHE_PREFIX = "notion_post_summary_";
    const POSTS_REQUEST_KEY_PREFIX = "notion_query_posts";
    const POST_REQUEST_KEY_PREFIX = "notion_page_";
    const POST_SUMMARY_CACHE_TTL = 1000 * 60 * 30;
    const POST_SUMMARY_CACHE_SWEEP_INTERVAL_MS = 1000 * 30;
    const POST_SUMMARY_QUOTA_SWEEP_INTERVAL_MS = 1000 * 60;
    const POSTS_RESPONSE_CACHE_TTL = 1000 * 20;
    const POSTS_RESPONSE_CACHE_MAX_ENTRIES = 12;
    const POST_SUMMARY_MEMORY_CACHE_LIMIT = 200;
    const POST_SUMMARY_SESSION_MAX_TITLE_LENGTH = 160;
    const POST_SUMMARY_SESSION_MAX_EXCERPT_LENGTH = 320;
    const POST_SUMMARY_SESSION_MAX_CATEGORY_LENGTH = 48;
    const POST_SUMMARY_SESSION_MAX_CATEGORY_LABEL_LENGTH = 64;
    const POST_SUMMARY_SESSION_MAX_READ_TIME_LENGTH = 48;
    const POST_SUMMARY_SESSION_MAX_TAGS = 8;
    const POST_SUMMARY_SESSION_MAX_TAG_LENGTH = 48;
    const POST_SUMMARY_SESSION_MAX_COVER_IMAGE_LENGTH = 320;
    const POST_SUMMARY_SESSION_MAX_IMAGE_SIGNATURE_LENGTH = 64;
    const POST_SUMMARY_SESSION_MAX_GRADIENT_LENGTH = 160;
    const CANONICAL_NOTION_POST_ID_PATTERN = /^[a-f0-9]{32}$/;
    const FLEXIBLE_NOTION_POST_ID_PATTERN = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;

    function createListingContentFacade() {
      const contentShared = window.NotionContentShared;
      const contentUtils = window.NotionContentUtils;
      const contentUrl = window.NotionContentUrl;
      const facade = {
        ALL_CATEGORY: contentShared?.ALL_CATEGORY,
        DEFAULT_CATEGORY_COLOR: contentShared?.DEFAULT_CATEGORY_COLOR,
        escapeHtml: contentUtils?.escapeHtml,
        getCategoryColor: contentShared?.getCategoryColor,
        getRemoteBlogCategories: contentShared?.getRemoteBlogCategories,
        gradientForCategory: contentShared?.gradientForCategory,
        isLikelyEphemeralAssetUrl: contentUrl?.isLikelyEphemeralAssetUrl,
        normalizeImageProxySignature: contentUrl?.normalizeImageProxySignature,
        normalizeSearchText: contentUtils?.normalizeSearchText,
        resolveDisplayImageUrl: contentUrl?.resolveDisplayImageUrl,
      };
      const requiredTypes = {
        ALL_CATEGORY: "string",
        DEFAULT_CATEGORY_COLOR: "object",
        escapeHtml: "function",
        getCategoryColor: "function",
        getRemoteBlogCategories: "function",
        gradientForCategory: "function",
        isLikelyEphemeralAssetUrl: "function",
        normalizeImageProxySignature: "function",
        normalizeSearchText: "function",
        resolveDisplayImageUrl: "function",
      };
      const missingHelpers = Object.entries(requiredTypes)
        .filter(([name, type]) => typeof facade[name] !== type)
        .map(([name]) => name);

      if (missingHelpers.length > 0) {
        throw new Error(
          `notion-api.js listing dependencies missing or wrong type: ${missingHelpers.join(", ")}. `
          + "Ensure notion-content-shared.js, notion-content-utils.js, and notion-content-url.js load first.",
        );
      }

      return Object.freeze(facade);
    }

    const listingContent = createListingContentFacade();
    const ALL_CATEGORY = listingContent.ALL_CATEGORY;
    const REMOTE_BLOG_CATEGORIES = listingContent.getRemoteBlogCategories();
    const fallbackCategoryColor = listingContent.DEFAULT_CATEGORY_COLOR;
    let categoryNavigationCache = normalizeCategoryList(REMOTE_BLOG_CATEGORIES);
    const categoryPresentationCache = new Map();
    const pendingRequests = new Map();
    const postsResponseCache = new Map();
    // postSummaryMemoryCache: Map<pageId, { summary, timestamp }>. The summary
    // and timestamp travel together so the LRU eviction and "exists" check stay
    // on a single source of truth — previous two-parallel-Maps design required
    // manual sync that was easy to break.
    const postSummaryMemoryCache = new Map();
    let lastPostSummaryCacheSweepAt = 0;
    let lastPostSummaryQuotaSweepAt = 0;
    const escapeHtml = listingContent.escapeHtml;

    function normalizeSearchText(value) {
      return listingContent.normalizeSearchText(value);
    }

    function gradientForCategory(category) {
      return listingContent.gradientForCategory(category);
    }

    function getCategoryColor(category) {
      const cached = categoryPresentationCache.get(normalizeSearchText(category));
      if (cached?.categoryColor) {
        return cached.categoryColor;
      }

      return listingContent.getCategoryColor(category);
    }

    function getArticleRenderer(methodName) {
      const articleContent = window.NotionContent;
      const renderer = articleContent?.[methodName];
      if (typeof renderer !== "function") {
        throw new Error(
          `notion-content.js must load before NotionAPI.${methodName}() can render article content`,
        );
      }
      return renderer.bind(articleContent);
    }

    function renderBlocks(blocks) {
      return getArticleRenderer("renderBlocks")(blocks, { baseOrigin: window.location.origin });
    }

    function normalizeCategoryColor(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
      }

      const bg = typeof value.bg === "string" && value.bg.trim() ? value.bg.trim() : "";
      const color = typeof value.color === "string" && value.color.trim() ? value.color.trim() : "";
      const border = typeof value.border === "string" && value.border.trim() ? value.border.trim() : "";

      if (!bg && !color && !border) {
        return null;
      }

      return {
        bg: bg || fallbackCategoryColor.bg,
        color: color || fallbackCategoryColor.color,
        border: border || fallbackCategoryColor.border,
      };
    }

    function normalizeCategoryItem(category) {
      if (!category || typeof category !== "object") return null;
      const name = truncateText(category.name, POST_SUMMARY_SESSION_MAX_CATEGORY_LENGTH);
      if (!name) return null;

      return {
        name,
        label: truncateText(category.label, POST_SUMMARY_SESSION_MAX_CATEGORY_LABEL_LENGTH, name),
        emoji: truncateText(category.emoji, 8),
        color: normalizeColorName(category.color),
        categoryColor: normalizeCategoryColor(category.categoryColor),
        coverGradient: truncateText(category.coverGradient, POST_SUMMARY_SESSION_MAX_GRADIENT_LENGTH),
      };
    }

    function normalizeCategoryList(categories) {
      if (!Array.isArray(categories)) {
        return [];
      }

      const seen = new Set();
      return categories
        .map(normalizeCategoryItem)
        .filter((category) => {
          if (!category) return false;
          const key = normalizeSearchText(category.name);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }

    function rememberCategories(categories) {
      const nextCategories = normalizeCategoryList(categories);
      if (nextCategories.length === 0) {
        return categoryNavigationCache;
      }

      categoryNavigationCache = nextCategories;
      nextCategories.forEach((category) => {
        categoryPresentationCache.set(normalizeSearchText(category.name), category);
      });
      return categoryNavigationCache;
    }

    function renderPostArticle(post) {
      return getArticleRenderer("renderPostArticle")(post, { baseOrigin: window.location.origin });
    }

    function createRequestError(message, { status, notionCode, code, detail, retryAfter } = {}) {
      const error = new Error(message);
      if (Number.isFinite(Number(status))) {
        error.status = Number(status);
      }
      if (typeof notionCode === "string" && notionCode) {
        error.notionCode = notionCode;
      }
      if (typeof code === "string" && code) {
        error.code = code;
      }
      if (typeof detail === "string" && detail) {
        error.detail = detail;
      }
      if (typeof retryAfter === "string" && retryAfter) {
        error.retryAfter = retryAfter;
      }
      return error;
    }

    function normalizePublicPostId(value) {
      const siteNormalizer = window.SiteUtils?.normalizePostId;
      if (typeof siteNormalizer === "function") {
        try {
          const normalized = siteNormalizer(value);
          return typeof normalized === "string" && CANONICAL_NOTION_POST_ID_PATTERN.test(normalized)
            ? normalized
            : null;
        } catch (error) {
          return null;
        }
      }

      if (typeof value !== "string") return null;
      const normalized = value.trim();
      return FLEXIBLE_NOTION_POST_ID_PATTERN.test(normalized)
        ? normalized.replace(/-/g, "").toLowerCase()
        : null;
    }

    function requirePublicPostId(value) {
      const normalized = normalizePublicPostId(value);
      if (normalized) return normalized;

      throw createRequestError("Invalid public post id", {
        status: 400,
        code: "invalid_post_id",
      });
    }

    function isPostSummaryCacheKey(key) {
      return typeof key === "string" && key.startsWith(POST_SUMMARY_CACHE_PREFIX);
    }

    function removeCacheEntry(key) {
      try {
        sessionStorage.removeItem(key);
      } catch (error) {
        console.debug("Notion summary cache entry removal failed:", error);
      }
    }

    function collectPostSummaryCacheEntries(excludeKey) {
      const entries = [];
      const corruptedKeys = [];

      // Pre-collect all keys to avoid index shifting if entries are removed
      // during iteration (e.g. by another tab or a future code change).
      const allKeys = [];
      try {
        for (let index = 0; index < sessionStorage.length; index += 1) {
          allKeys.push(sessionStorage.key(index));
        }
      } catch (error) {
        return [];
      }

      for (const key of allKeys) {
        if (!key || key === excludeKey || !isPostSummaryCacheKey(key)) continue;

        const raw = sessionStorage.getItem(key);
        if (!raw) {
          entries.push({ key, timestamp: 0 });
          continue;
        }

        try {
          const parsed = JSON.parse(raw);
          entries.push({
            key,
            timestamp: Number.isFinite(Number(parsed?.timestamp)) ? Number(parsed.timestamp) : 0,
          });
        } catch (error) {
          corruptedKeys.push(key);
        }
      }

      corruptedKeys.forEach(removeCacheEntry);
      return entries.sort((left, right) => left.timestamp - right.timestamp);
    }

    function shouldRunPostSummarySweep(now, intervalMs, lastSweepAt) {
      const safeIntervalMs = Math.max(0, Number(intervalMs) || 0);
      if (safeIntervalMs <= 0) return true;
      if (!Number.isFinite(lastSweepAt) || lastSweepAt <= 0) return true;
      return now - lastSweepAt >= safeIntervalMs;
    }

    function removeExpiredPostSummaryCacheEntries(
      maxAge = POST_SUMMARY_CACHE_TTL,
      excludeKey,
      { force = false, now = Date.now() } = {},
    ) {
      if (!(maxAge > 0)) return 0;
      if (!force && !shouldRunPostSummarySweep(
        now,
        POST_SUMMARY_CACHE_SWEEP_INTERVAL_MS,
        lastPostSummaryCacheSweepAt,
      )) {
        return 0;
      }

      if (!force) {
        lastPostSummaryCacheSweepAt = now;
      }

      const expirationThreshold = now - maxAge;
      let removedCount = 0;
      collectPostSummaryCacheEntries(excludeKey).forEach((entry) => {
        if (entry.timestamp > 0 && entry.timestamp < expirationThreshold) {
          removeCacheEntry(entry.key);
          removedCount += 1;
        }
      });

      return removedCount;
    }

    function shouldRunPostSummaryQuotaSweep(now = Date.now()) {
      if (!shouldRunPostSummarySweep(
        now,
        POST_SUMMARY_QUOTA_SWEEP_INTERVAL_MS,
        lastPostSummaryQuotaSweepAt,
      )) {
        return false;
      }

      lastPostSummaryQuotaSweepAt = now;
      return true;
    }

    function trySetSessionCacheItem(key, payload) {
      try {
        sessionStorage.setItem(key, payload);
        return true;
      } catch (error) {
        console.debug("Failed to persist Notion session cache:", error);
        return false;
      }
    }

    function readSessionCache(key) {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (error) {
        if (isPostSummaryCacheKey(key)) {
          removeCacheEntry(key);
        }
        return null;
      }
    }

    function truncateText(value, maxLength, fallback = "") {
      const normalizedValue = typeof value === "string" ? value.trim() : "";
      if (!normalizedValue) return fallback;
      return normalizedValue.length > maxLength
        ? normalizedValue.slice(0, maxLength).trim()
        : normalizedValue;
    }

    function normalizeColorName(value) {
      return truncateText(value, 32);
    }

    function normalizeSessionTags(tags) {
      if (!Array.isArray(tags)) return [];

      return tags
        .map((tag) => truncateText(tag, POST_SUMMARY_SESSION_MAX_TAG_LENGTH))
        .filter(Boolean)
        .slice(0, POST_SUMMARY_SESSION_MAX_TAGS);
    }

    function normalizeSessionCoverImage(coverImage) {
      const safeImageUrl = listingContent.resolveDisplayImageUrl(coverImage, window.location.origin);

      if (!safeImageUrl || safeImageUrl.length > POST_SUMMARY_SESSION_MAX_COVER_IMAGE_LENGTH) {
        return null;
      }

      if (listingContent.isLikelyEphemeralAssetUrl(safeImageUrl, window.location.origin)) {
        return null;
      }

      return safeImageUrl;
    }

    function compactPostSummaryForSession(data) {
      const summary = normalizePostSummary(data);
      if (!summary) return data;

      return {
        id: summary.id,
        title: truncateText(summary.title, POST_SUMMARY_SESSION_MAX_TITLE_LENGTH, "Untitled"),
        excerpt: truncateText(summary.excerpt, POST_SUMMARY_SESSION_MAX_EXCERPT_LENGTH),
        category: truncateText(summary.category, POST_SUMMARY_SESSION_MAX_CATEGORY_LENGTH),
        categoryLabel: truncateText(summary.categoryLabel, POST_SUMMARY_SESSION_MAX_CATEGORY_LABEL_LENGTH),
        categoryColor: normalizeCategoryColor(summary.categoryColor),
        date: truncateText(summary.date, 32),
        readTime: truncateText(summary.readTime, POST_SUMMARY_SESSION_MAX_READ_TIME_LENGTH),
        coverImage: normalizeSessionCoverImage(summary.coverImage),
        coverImageSignature: truncateText(
          listingContent.normalizeImageProxySignature(summary.coverImageSignature),
          POST_SUMMARY_SESSION_MAX_IMAGE_SIGNATURE_LENGTH,
        ),
        coverEmoji: truncateText(summary.coverEmoji, 8, "📝"),
        coverGradient: truncateText(summary.coverGradient, POST_SUMMARY_SESSION_MAX_GRADIENT_LENGTH),
        tags: normalizeSessionTags(summary.tags),
      };
    }

    function writeSessionCache(key, data, timestamp = Date.now()) {
      const payload = JSON.stringify({
        timestamp,
        data: compactPostSummaryForSession(data),
      });

      const now = Date.now();
      removeExpiredPostSummaryCacheEntries(POST_SUMMARY_CACHE_TTL, key, { now });
      if (trySetSessionCacheItem(key, payload)) return;

      if (shouldRunPostSummaryQuotaSweep(Date.now())) {
        removeExpiredPostSummaryCacheEntries(POST_SUMMARY_CACHE_TTL, key, { force: true });
        if (trySetSessionCacheItem(key, payload)) return;
      }

      // Expired-entry cleanup was not enough; evict oldest entries one by one.
      const existingEntries = collectPostSummaryCacheEntries(key);
      for (const entry of existingEntries) {
        removeCacheEntry(entry.key);
        if (trySetSessionCacheItem(key, payload)) {
          return;
        }
      }
    }

    function getPostSummaryCacheKey(pageId) {
      return `${POST_SUMMARY_CACHE_PREFIX}${pageId}`;
    }

    function normalizePostSummary(post) {
      const id = normalizePublicPostId(post?.id);
      if (!id) return null;

      const title = post.title || "Untitled";
      const excerpt = post.excerpt || "";
      const category = post.category || "";
      const categoryLabel = truncateText(post.categoryLabel, POST_SUMMARY_SESSION_MAX_CATEGORY_LABEL_LENGTH, category);
      const categoryColor = normalizeCategoryColor(post.categoryColor);
      const readTime = post.readTime || "";
      const coverImage = post.coverImage || null;
      const coverImageSignature = listingContent.normalizeImageProxySignature(
        post.coverImageSignature,
      );
      const coverEmoji = post.coverEmoji || "📝";
      const cachedCategory = categoryPresentationCache.get(normalizeSearchText(category));
      const coverGradient = post.coverGradient || cachedCategory?.coverGradient || gradientForCategory(category);
      const tags = Array.isArray(post.tags) ? [...post.tags] : [];

      return {
        id,
        title,
        excerpt,
        category,
        categoryLabel,
        categoryColor,
        date: post.date || "",
        readTime,
        coverImage,
        coverImageSignature,
        coverEmoji,
        coverGradient,
        tags,
      };
    }

    function rememberPostSummaryInMemory(summary, timestamp = Date.now()) {
      if (!summary?.id) return null;

      // Re-insert to move the entry to the most-recently-used position.
      postSummaryMemoryCache.delete(summary.id);
      postSummaryMemoryCache.set(summary.id, { summary, timestamp });

      while (postSummaryMemoryCache.size > POST_SUMMARY_MEMORY_CACHE_LIMIT) {
        const oldestId = postSummaryMemoryCache.keys().next().value;
        if (!oldestId) break;
        postSummaryMemoryCache.delete(oldestId);
      }

      return summary;
    }

    function storePostSummary(post, timestamp = Date.now()) {
      const summary = normalizePostSummary(post);
      if (!summary) return null;

      if (summary.category) {
        categoryPresentationCache.set(normalizeSearchText(summary.category), {
          name: summary.category,
          label: summary.categoryLabel || summary.category,
          categoryColor: summary.categoryColor,
          coverGradient: summary.coverGradient,
        });
      }

      rememberPostSummaryInMemory(summary, timestamp);
      writeSessionCache(getPostSummaryCacheKey(summary.id), summary, timestamp);
      return summary;
    }

    function primePostSummaries(posts, timestamp = Date.now()) {
      (posts || []).forEach((post) => {
        storePostSummary(post, timestamp);
      });
    }

    function getPostSummarySnapshot(pageId) {
      const normalizedPageId = normalizePublicPostId(pageId);
      if (!normalizedPageId) return null;

      const memoryEntry = postSummaryMemoryCache.get(normalizedPageId);
      if (memoryEntry) {
        rememberPostSummaryInMemory(memoryEntry.summary, memoryEntry.timestamp);
        return {
          summary: memoryEntry.summary,
          timestamp: memoryEntry.timestamp,
          age: Date.now() - memoryEntry.timestamp,
        };
      }

      const cached = readSessionCache(getPostSummaryCacheKey(normalizedPageId));
      if (!cached) return null;
      const timestamp = Number(cached.timestamp);
      if (!Number.isFinite(timestamp)) return null;

      const summary = normalizePostSummary(cached.data);
      if (!summary) return null;

      rememberPostSummaryInMemory(summary, timestamp);
      return {
        summary,
        timestamp,
        age: Date.now() - timestamp,
      };
    }

    function getPostSummary(pageId, maxAge = POST_SUMMARY_CACHE_TTL) {
      const snapshot = getPostSummarySnapshot(pageId);
      if (!snapshot || snapshot.age >= maxAge) return null;
      return snapshot.summary;
    }

    function createAbortError() {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      return error;
    }

    function throwIfAborted(signal) {
      if (signal?.aborted) {
        throw createAbortError();
      }
    }

    function consumePendingRequest(entry, signal) {
      try {
        throwIfAborted(signal);
      } catch (error) {
        return Promise.reject(error);
      }

      entry.consumerCount += 1;
      return new Promise((resolve, reject) => {
        let didSettle = false;

        const settle = (handler, value, wasAborted = false) => {
          if (didSettle) return;
          didSettle = true;
          signal?.removeEventListener?.("abort", handleAbort);
          entry.consumerCount = Math.max(0, entry.consumerCount - 1);
          if (wasAborted && entry.consumerCount === 0 && !entry.didSettle) {
            entry.controller.abort();
          }
          handler(value);
        };

        const handleAbort = () => settle(reject, createAbortError(), true);
        signal?.addEventListener?.("abort", handleAbort, { once: true });
        entry.promise.then(
          (value) => settle(resolve, value),
          (error) => settle(reject, error),
        );
      });
    }

    function withPendingRequest(key, loader, { signal } = {}) {
      let entry = pendingRequests.get(key);
      if (entry?.controller.signal.aborted && entry.consumerCount === 0) {
        pendingRequests.delete(key);
        entry = null;
      }

      if (!entry) {
        const controller = new AbortController();
        entry = {
          controller,
          consumerCount: 0,
          didSettle: false,
          promise: null,
        };

        const pending = Promise.resolve()
          .then(() => loader(controller.signal))
          .finally(() => {
            entry.didSettle = true;
            if (pendingRequests.get(key) === entry) {
              pendingRequests.delete(key);
            }
          });
        entry.promise = pending;
        pendingRequests.set(key, entry);
      }

      return consumePendingRequest(entry, signal);
    }

    function normalizeRequestUrl(url) {
      try {
        const resolved = new URL(url, window.location.origin);
        resolved.hash = "";
        return resolved.href;
      } catch (error) {
        return "";
      }
    }

    function takeBlogInitialData(requestUrl, signal) {
      const bootstrap = window.PageBootstrap?.blogInitialData;
      if (
        !bootstrap ||
        bootstrap.consumed ||
        normalizeRequestUrl(bootstrap.requestUrl) !== normalizeRequestUrl(requestUrl)
      ) {
        return null;
      }

      bootstrap.consumed = true;
      const bootstrapStartedAt = Number(bootstrap.startedAt);
      const elapsedMs = Number.isFinite(bootstrapStartedAt)
        ? Math.max(0, Date.now() - bootstrapStartedAt)
        : 0;
      const remainingMs = Math.max(0, PUBLIC_CONTENT_REQUEST_TIMEOUT_MS - elapsedMs);

      return new Promise((resolve, reject) => {
        let didSettle = false;
        let timeoutId = null;

        const settle = (handler, value) => {
          if (didSettle) return;
          didSettle = true;
          clearTimeout(timeoutId);
          signal?.removeEventListener?.("abort", handleAbort);
          handler(value);
        };
        const handleAbort = () => {
          bootstrap.controller?.abort?.();
          settle(reject, createAbortError());
        };

        signal?.addEventListener?.("abort", handleAbort, { once: true });
        if (signal?.aborted) {
          handleAbort();
          return;
        }

        timeoutId = setTimeout(() => {
          settle(reject, createRequestError("Notion API request timed out", { status: 504 }));
          bootstrap.controller?.abort?.();
        }, remainingMs);

        Promise.resolve(bootstrap.promise)
          .then(async (payload) => {
            if (payload && typeof payload.json === "function") {
              return payload.json();
            }
            return payload;
          })
          .then(
            (payload) => settle(resolve, payload),
            (error) => settle(reject, error),
          );
      });
    }

    async function requestJsonWithTimeout(url, init = {}, { signal } = {}) {
      throwIfAborted(signal);
      const controller = new AbortController();
      let didTimeOut = false;
      const handleCallerAbort = () => controller.abort();
      signal?.addEventListener?.("abort", handleCallerAbort, { once: true });
      const timeoutId = setTimeout(() => {
        didTimeOut = true;
        controller.abort();
      }, PUBLIC_CONTENT_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });

        if (!response.ok) {
          let rawDetail = "";
          try {
            rawDetail = await response.text();
          } catch (error) {
            if (error?.name === "AbortError") throw error;
          }
          let detail = rawDetail;
          let notionCode = "";
          let code = "";

          if (rawDetail) {
            try {
              const parsedDetail = JSON.parse(rawDetail);
              if (typeof parsedDetail?.detail === "string" && parsedDetail.detail) {
                detail = parsedDetail.detail;
              } else if (typeof parsedDetail?.message === "string" && parsedDetail.message) {
                detail = parsedDetail.message;
              } else if (typeof parsedDetail?.error === "string" && parsedDetail.error) {
                detail = parsedDetail.error;
              }
              if (typeof parsedDetail?.code === "string" && parsedDetail.code) {
                code = parsedDetail.code;
              }
              if (typeof parsedDetail?.notionCode === "string" && parsedDetail.notionCode) {
                notionCode = parsedDetail.notionCode;
              }
            } catch (error) {
              console.debug("Failed to parse Notion API error body as JSON:", error);
            }
          }

          const retryAfter = response.headers?.get?.("retry-after") || "";

          throw createRequestError(`Notion API error: ${response.status}${detail ? ` ${detail}` : ""}`, {
            status: response.status,
            notionCode,
            code,
            detail,
            retryAfter,
          });
        }

        // Awaited so the timeout (cleared in finally) still covers JSON parse;
        // a hung body stream after fetch resolves would otherwise skip abort.
        return await response.json();
      } catch (error) {
        if (error?.name === "AbortError") {
          if (didTimeOut) {
            throw createRequestError("Notion API request timed out", {
              status: 504,
            });
          }
          throw createAbortError();
        }

        throw error;
      } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener?.("abort", handleCallerAbort);
      }
    }

    function buildPostQueryString({ category, search, page } = {}) {
      const params = new URLSearchParams();

      if (category && category !== ALL_CATEGORY) {
        params.set("category", category);
      }

      if (search) {
        params.set("search", search);
      }

      const requestedPage = Number.isFinite(Number(page))
        ? Math.max(1, Math.trunc(Number(page)))
        : 1;
      if (requestedPage > 1) {
        params.set("page", String(requestedPage));
      }

      const queryString = params.toString();
      return queryString ? `?${queryString}` : "";
    }

    function buildPostsRequestKey(options = {}) {
      return `${POSTS_REQUEST_KEY_PREFIX}${buildPostQueryString(options)}`;
    }

    function normalizePostQueryResult(data) {
      const categories = rememberCategories(data?.categories);
      const results = Array.isArray(data?.results)
        ? data.results.map(normalizePostSummary).filter(Boolean)
        : [];
      const total = Number.isFinite(Number(data?.total)) ? Number(data.total) : results.length;
      const totalPages = Math.max(
        1,
        Number.isFinite(Number(data?.totalPages))
          ? Number(data.totalPages)
          : Math.ceil(total / CONFIG.pageSize) || 1,
      );
      const currentPage = Math.max(
        1,
        Number.isFinite(Number(data?.currentPage)) ? Number(data.currentPage) : 1,
      );

      return {
        results,
        total,
        totalPages,
        currentPage,
        categories,
      };
    }

    function clonePostSummary(post) {
      if (!post || typeof post !== "object") return post;

      return {
        ...post,
        categoryColor: post.categoryColor ? { ...post.categoryColor } : post.categoryColor,
        tags: Array.isArray(post.tags) ? [...post.tags] : [],
      };
    }

    function clonePostQueryResult(data) {
      return {
        results: Array.isArray(data?.results) ? data.results.map(clonePostSummary) : [],
        categories: Array.isArray(data?.categories)
          ? data.categories.map((category) => ({
            ...category,
            categoryColor: category.categoryColor ? { ...category.categoryColor } : category.categoryColor,
          }))
          : [],
        total: Number.isFinite(Number(data?.total)) ? Number(data.total) : 0,
        totalPages: Math.max(1, Number.isFinite(Number(data?.totalPages)) ? Number(data.totalPages) : 1),
        currentPage: Math.max(1, Number.isFinite(Number(data?.currentPage)) ? Number(data.currentPage) : 1),
      };
    }

    function readCachedPostsResponse(key) {
      const cached = postsResponseCache.get(key);
      if (!cached) return null;

      if (Date.now() >= cached.expiresAt) {
        postsResponseCache.delete(key);
        return null;
      }

      postsResponseCache.delete(key);
      postsResponseCache.set(key, cached);
      return clonePostQueryResult(cached.data);
    }

    function cachePostsResponse(key, data) {
      if (!key || !data) return;

      postsResponseCache.set(key, {
        data: clonePostQueryResult(data),
        expiresAt: Date.now() + POSTS_RESPONSE_CACHE_TTL,
      });

      while (postsResponseCache.size > POSTS_RESPONSE_CACHE_MAX_ENTRIES) {
        const oldestKey = postsResponseCache.keys().next().value;
        if (!oldestKey) break;
        postsResponseCache.delete(oldestKey);
      }
    }

    async function fetchPostsRemote(options, { signal } = {}) {
      throwIfAborted(signal);
      const requestKey = buildPostsRequestKey(options);
      const cachedResponse = readCachedPostsResponse(requestKey);
      if (cachedResponse) {
        rememberCategories(cachedResponse.categories);
        primePostSummaries(cachedResponse.results);
        return cachedResponse;
      }

      return withPendingRequest(requestKey, async (requestSignal) => {
        const requestUrl = `${CONFIG.postsEndpoint}${buildPostQueryString(options)}`;
        const initialData = takeBlogInitialData(requestUrl, requestSignal);
        const mappedData = normalizePostQueryResult(
          await (initialData || requestJsonWithTimeout(requestUrl, {}, { signal: requestSignal })),
        );

        primePostSummaries(mappedData.results);
        cachePostsResponse(requestKey, mappedData);
        return clonePostQueryResult(mappedData);
      }, { signal });
    }

    async function liveQueryDatabase({ category, search, page = 1 } = {}, requestOptions = {}) {
      return fetchPostsRemote({ category, search, page }, requestOptions);
    }

    async function fetchPageRemote(pageId, { signal } = {}) {
      throwIfAborted(signal);
      const normalizedPageId = requirePublicPostId(pageId);
      return withPendingRequest(`${POST_REQUEST_KEY_PREFIX}${normalizedPageId}`, async (requestSignal) => {
        const responseData = await requestJsonWithTimeout(
          `${CONFIG.postEndpoint}?id=${encodeURIComponent(normalizedPageId)}`,
          {},
          { signal: requestSignal },
        );
        const mappedData = {
          ...responseData,
          id: normalizedPageId,
        };

        storePostSummary(mappedData);
        return mappedData;
      }, { signal });
    }

    async function liveGetPage(pageId, requestOptions = {}) {
      return fetchPageRemote(pageId, requestOptions);
    }

    return {
      getCategories: () => categoryNavigationCache.map((category) => ({
        ...category,
        categoryColor: category.categoryColor ? { ...category.categoryColor } : category.categoryColor,
      })),
      queryPosts: (options = {}, requestOptions = {}) => liveQueryDatabase(options, requestOptions),
      getPost: (pageId, requestOptions = {}) => liveGetPage(pageId, requestOptions),
      getPostSummary,
      renderPostArticle,
      renderBlocks,
      escapeHtml,
      getCategoryColor,
      getPageSize: () => CONFIG.pageSize,
    };
  })();

  window.NotionAPI = NotionAPI;
})();
