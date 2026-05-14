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
    const REQUEST_TIMEOUT = 8000;
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
    const POST_SUMMARY_SESSION_MAX_GRADIENT_LENGTH = 160;
    const sharedContent = window.NotionContent;
    const ALL_CATEGORY = sharedContent.ALL_CATEGORY;
    const REMOTE_BLOG_CATEGORIES = sharedContent.getRemoteBlogCategories();
    const fallbackCategoryColor = sharedContent.DEFAULT_CATEGORY_COLOR;
    const fallbackCoverGradient = sharedContent.DEFAULT_COVER_GRADIENT;
    let categoryNavigationCache = normalizeCategoryList(REMOTE_BLOG_CATEGORIES);
    const categoryPresentationCache = new Map();
    const pendingRequests = new Map();
    const postsResponseCache = new Map();
    const postSummaryMemoryCache = new Map();
    const postSummaryTimestampCache = new Map();
    let lastPostSummaryCacheSweepAt = 0;
    let lastPostSummaryQuotaSweepAt = 0;
    const escapeHtml = sharedContent.escapeHtml;

    function normalizeSearchText(value) {
      return sharedContent.normalizeSearchText(value);
    }

    function gradientForCategory(category) {
      return sharedContent.gradientForCategory(category);
    }

    function getCategoryColor(category) {
      const cached = categoryPresentationCache.get(normalizeSearchText(category));
      if (cached?.categoryColor) {
        return cached.categoryColor;
      }

      return sharedContent.getCategoryColor(category);
    }

    function renderBlocks(blocks) {
      return sharedContent.renderBlocks(blocks, { baseOrigin: window.location.origin });
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
        color: truncateText(category.color, 32),
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
      return sharedContent.renderPostArticle(post, { baseOrigin: window.location.origin });
    }

    function createRequestError(message, { status, notionCode, code, detail } = {}) {
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
      return error;
    }

    function isPostSummaryCacheKey(key) {
      return typeof key === "string" && key.startsWith(POST_SUMMARY_CACHE_PREFIX);
    }

    function removeCacheEntry(key) {
      try {
        sessionStorage.removeItem(key);
      } catch (error) {}
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

    function normalizeSessionTags(tags) {
      if (!Array.isArray(tags)) return [];

      return tags
        .map((tag) => truncateText(tag, POST_SUMMARY_SESSION_MAX_TAG_LENGTH))
        .filter(Boolean)
        .slice(0, POST_SUMMARY_SESSION_MAX_TAGS);
    }

    function normalizeSessionCoverImage(coverImage) {
      const safeImageUrl = sharedContent.resolveDisplayImageUrl(coverImage, window.location.origin);

      if (!safeImageUrl || safeImageUrl.length > POST_SUMMARY_SESSION_MAX_COVER_IMAGE_LENGTH) {
        return null;
      }

      if (sharedContent.isLikelyEphemeralAssetUrl(safeImageUrl, window.location.origin)) {
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
      if (!post?.id) return null;

      const title = post.title || "Untitled";
      const excerpt = post.excerpt || "";
      const category = post.category || "";
      const categoryLabel = truncateText(post.categoryLabel, POST_SUMMARY_SESSION_MAX_CATEGORY_LABEL_LENGTH, category);
      const categoryColor = normalizeCategoryColor(post.categoryColor);
      const readTime = post.readTime || "";
      const coverImage = post.coverImage || null;
      const coverEmoji = post.coverEmoji || "📝";
      const cachedCategory = categoryPresentationCache.get(normalizeSearchText(category));
      const coverGradient = post.coverGradient || cachedCategory?.coverGradient || gradientForCategory(category);
      const tags = Array.isArray(post.tags) ? [...post.tags] : [];

      return {
        id: post.id,
        title,
        excerpt,
        category,
        categoryLabel,
        categoryColor,
        date: post.date || "",
        readTime,
        coverImage,
        coverEmoji,
        coverGradient,
        tags,
      };
    }

    function rememberPostSummaryInMemory(summary, timestamp = Date.now()) {
      if (!summary?.id) return null;

      postSummaryMemoryCache.delete(summary.id);
      postSummaryTimestampCache.delete(summary.id);
      postSummaryMemoryCache.set(summary.id, summary);
      postSummaryTimestampCache.set(summary.id, timestamp);

      while (postSummaryMemoryCache.size > POST_SUMMARY_MEMORY_CACHE_LIMIT) {
        const oldestId = postSummaryMemoryCache.keys().next().value;
        if (!oldestId) break;
        postSummaryMemoryCache.delete(oldestId);
        postSummaryTimestampCache.delete(oldestId);
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
      if (!pageId) return null;

      if (postSummaryMemoryCache.has(pageId) && postSummaryTimestampCache.has(pageId)) {
        const summary = postSummaryMemoryCache.get(pageId);
        const timestamp = postSummaryTimestampCache.get(pageId);
        rememberPostSummaryInMemory(summary, timestamp);
        return {
          summary,
          timestamp,
          age: Date.now() - timestamp,
        };
      }

      postSummaryMemoryCache.delete(pageId);
      postSummaryTimestampCache.delete(pageId);

      const cached = readSessionCache(getPostSummaryCacheKey(pageId));
      if (!cached) return null;

      const summary = normalizePostSummary(cached.data);
      if (!summary) return null;

      rememberPostSummaryInMemory(summary, cached.timestamp);
      return {
        summary,
        timestamp: cached.timestamp,
        age: Date.now() - cached.timestamp,
      };
    }

    function getPostSummary(pageId, maxAge = POST_SUMMARY_CACHE_TTL) {
      const snapshot = getPostSummarySnapshot(pageId);
      if (!snapshot || snapshot.age >= maxAge) return null;
      return snapshot.summary;
    }

    function withPendingRequest(key, loader) {
      if (pendingRequests.has(key)) {
        return pendingRequests.get(key);
      }

      const pending = Promise.resolve()
        .then(loader)
        .finally(() => {
          if (pendingRequests.get(key) === pending) {
            pendingRequests.delete(key);
          }
        });

      pendingRequests.set(key, pending);
      return pending;
    }

    async function requestJsonWithTimeout(url, init = {}) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });

        if (!response.ok) {
          const rawDetail = await response.text().catch(() => "");
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
            } catch (error) {}
          }

          throw createRequestError(`Notion API error: ${response.status}${detail ? ` ${detail}` : ""}`, {
            status: response.status,
            notionCode,
            code,
            detail,
          });
        }

        return response.json();
      } catch (error) {
        if (error?.name === "AbortError") {
          throw createRequestError("Notion API request timed out", {
            status: 504,
          });
        }

        throw error;
      } finally {
        clearTimeout(timeoutId);
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

    async function fetchPostsRemote(options) {
      const requestKey = buildPostsRequestKey(options);
      const cachedResponse = readCachedPostsResponse(requestKey);
      if (cachedResponse) {
        rememberCategories(cachedResponse.categories);
        primePostSummaries(cachedResponse.results);
        return cachedResponse;
      }

      return withPendingRequest(requestKey, async () => {
        const mappedData = normalizePostQueryResult(
          await requestJsonWithTimeout(`${CONFIG.postsEndpoint}${buildPostQueryString(options)}`),
        );

        primePostSummaries(mappedData.results);
        cachePostsResponse(requestKey, mappedData);
        return clonePostQueryResult(mappedData);
      });
    }

    async function liveQueryDatabase({ category, search, page = 1 }) {
      return fetchPostsRemote({ category, search, page });
    }

    async function fetchPageRemote(pageId) {
      return withPendingRequest(`${POST_REQUEST_KEY_PREFIX}${pageId}`, async () => {
        const mappedData = await requestJsonWithTimeout(
          `${CONFIG.postEndpoint}?id=${encodeURIComponent(pageId)}`,
        );

        storePostSummary(mappedData);
        return mappedData;
      });
    }

    async function liveGetPage(pageId) {
      return fetchPageRemote(pageId);
    }

    return {
      getCategories: () => categoryNavigationCache.map((category) => ({
        ...category,
        categoryColor: category.categoryColor ? { ...category.categoryColor } : category.categoryColor,
      })),
      queryPosts: (options = {}) => liveQueryDatabase(options),
      getPost: (pageId) => liveGetPage(pageId),
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
