/**
 * Shared bookmark (favorite) manager for `blog.html` and `post.html`.
 */

(() => {
  const BookmarkManager = (() => {
    const BOOKMARK_KEY = "bookmarked_posts";
    // The generation handles one-time record migrations. The freshness window
    // separately bounds how long volatile cover signatures may be reused after
    // a signing-key rotation. Keep it aligned with NotionAPI's summary-cache
    // TTL so an expired bookmark refresh cannot be satisfied indefinitely by
    // the same stale session summary.
    const BOOKMARK_METADATA_HYDRATION_GENERATION = 8;
    const BOOKMARK_METADATA_FRESHNESS_MS = 1000 * 60 * 30;
    const BOOKMARK_METADATA_FUTURE_CLOCK_SKEW_MS = 1000 * 60 * 5;
    const siteUtils = window.SiteUtils || {};
    const resolveDisplayImageUrl = siteUtils.resolveDisplayImageUrl;
    const sanitizeImageUrl = siteUtils.sanitizeImageUrl;
    const sanitizeCoverBackground = siteUtils.sanitizeCoverBackground;
    const normalizeImageProxySignature = siteUtils.normalizeImageProxySignature;
    const normalizePostId = siteUtils.normalizePostId;
    let bookmarksCache = null;
    let metadataHydrationPromise = null;
    let storageSyncTimer = null;
    const recentlyRemoved = new Map();

    function escapeSelectorValue(value) {
      return window.CSS.escape(String(value));
    }

    function normalizeText(value, fallback = "") {
      return typeof value === "string" ? value : fallback;
    }

    function normalizeTags(value) {
      if (!Array.isArray(value)) return [];

      return value
        .map((tag) => normalizeText(tag).trim())
        .filter(Boolean);
    }

    function normalizePersistentCoverImage(value) {
      if (typeof resolveDisplayImageUrl === "function") {
        return resolveDisplayImageUrl(value);
      }

      if (typeof sanitizeImageUrl === "function") {
        return sanitizeImageUrl(value);
      }

      return null;
    }

    function normalizeBookmarkId(value) {
      const legacyId = normalizeText(value).trim();
      if (!legacyId) return "";

      const canonicalId = typeof normalizePostId === "function"
        ? normalizePostId(legacyId)
        : null;
      // Preserve non-Notion legacy/test ids exactly as before. Valid Notion
      // UUIDs converge to the compact lowercase route/cache representation.
      return canonicalId || legacyId;
    }

    function normalizeBookmark(entry) {
      if (!entry || typeof entry !== "object") return null;

      const id = normalizeBookmarkId(entry.id);
      if (!id) return null;

      const title = normalizeText(entry.title);
      const excerpt = normalizeText(entry.excerpt);
      const tags = normalizeTags(entry.tags);
      const metadataVersion = Number.isFinite(Number(entry.metadataVersion))
        ? Number(entry.metadataVersion)
        : 1;
      const rawMetadataRefreshedAt = Number(entry.metadataRefreshedAt);
      const metadataRefreshedAt = Number.isFinite(rawMetadataRefreshedAt) && rawMetadataRefreshedAt > 0
        ? rawMetadataRefreshedAt
        : 0;

      return {
        id,
        title,
        category: normalizeText(entry.category),
        excerpt,
        date: normalizeText(entry.date),
        updatedAt: normalizeText(entry.updatedAt),
        readTime: normalizeText(entry.readTime),
        coverImage: normalizePersistentCoverImage(entry.coverImage),
        coverImageSignature:
          typeof normalizeImageProxySignature === "function"
            ? normalizeImageProxySignature(entry.coverImageSignature)
            : "",
        coverEmoji: normalizeText(entry.coverEmoji, "📝"),
        coverGradient:
          typeof sanitizeCoverBackground === "function"
            ? sanitizeCoverBackground(entry.coverGradient)
            : null,
        tags,
        metadataVersion,
        metadataRefreshedAt,
        timestamp: Number.isFinite(Number(entry.timestamp)) ? Number(entry.timestamp) : Date.now(),
      };
    }

    function normalizeBookmarkCollection(value) {
      if (!Array.isArray(value)) return [];

      const seenIds = new Set();
      const normalized = [];
      for (const entry of value) {
        const bookmark = normalizeBookmark(entry);
        if (!bookmark || seenIds.has(bookmark.id)) continue;
        seenIds.add(bookmark.id);
        normalized.push(bookmark);
      }
      return normalized;
    }

    function readBookmarks() {
      if (bookmarksCache) return bookmarksCache;

      try {
        const parsed = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "[]");
        bookmarksCache = normalizeBookmarkCollection(parsed);
      } catch (error) {
        bookmarksCache = [];
      }

      return bookmarksCache;
    }

    function getAll() {
      return [...readBookmarks()];
    }

    function getCurrentPostSummary(id, { allowPartial = false } = {}) {
      try {
        const summary = window.NotionAPI?.getPostSummary?.(id);
        return summary && (allowPartial || !summary.isPartial) ? summary : null;
      } catch (error) {
        return null;
      }
    }

    function normalizeVolatileCoverMetadata(source) {
      return {
        coverImage: normalizePersistentCoverImage(source?.coverImage),
        coverImageSignature:
          typeof normalizeImageProxySignature === "function"
            ? normalizeImageProxySignature(source?.coverImageSignature)
            : "",
      };
    }

    function mergeVolatileCoverMetadata(bookmark, source) {
      return {
        ...bookmark,
        ...normalizeVolatileCoverMetadata(source),
      };
    }

    function hasVolatileCoverMetadataChanged(bookmark, source) {
      const current = normalizeVolatileCoverMetadata(bookmark);
      const latest = normalizeVolatileCoverMetadata(source);
      return (
        current.coverImage !== latest.coverImage ||
        current.coverImageSignature !== latest.coverImageSignature
      );
    }

    function hasExpiredMetadata(bookmark, now = Date.now()) {
      if (Number(bookmark?.metadataVersion || 0) < BOOKMARK_METADATA_HYDRATION_GENERATION) {
        return true;
      }

      const refreshedAt = Number(bookmark?.metadataRefreshedAt || 0);
      if (!Number.isFinite(refreshedAt) || refreshedAt <= 0) return true;
      if (refreshedAt > now + BOOKMARK_METADATA_FUTURE_CLOCK_SKEW_MS) return true;
      return now - refreshedAt >= BOOKMARK_METADATA_FRESHNESS_MS;
    }

    function getDisplayEntries() {
      return readBookmarks().map((bookmark) => {
        const currentSummary = getCurrentPostSummary(bookmark.id);
        if (currentSummary) {
          return mergeVolatileCoverMetadata(bookmark, currentSummary);
        }

        if (hasExpiredMetadata(bookmark)) {
          // An expired signature must not keep producing permanent proxy 403s.
          // Keep the persisted record untouched so offline users retain the
          // bookmark and its gradient/emoji fallback until hydration succeeds.
          return {
            ...bookmark,
            coverImage: null,
            coverImageSignature: "",
          };
        }

        return { ...bookmark };
      });
    }

    function save(bookmarks) {
      const nextBookmarks = normalizeBookmarkCollection(bookmarks);

      try {
        localStorage.setItem(BOOKMARK_KEY, JSON.stringify(nextBookmarks));
        bookmarksCache = nextBookmarks;
        return true;
      } catch (error) {
        console.debug("Failed to persist bookmarks:", error);
        return false;
      }
    }

    function dispatchBookmarksUpdated() {
      if (typeof window.dispatchEvent !== "function") return;
      if (typeof window.CustomEvent !== "function") return;

      const detail = { bookmarks: getAll() };
      const event = new window.CustomEvent("bookmarks:updated", { detail });
      window.dispatchEvent(event);
    }

    function isBookmarked(id) {
      const normalizedId = normalizeBookmarkId(id);
      return Boolean(
        normalizedId && readBookmarks().some((bookmark) => bookmark.id === normalizedId)
      );
    }

    function needsMetadataHydration(bookmark) {
      if (hasExpiredMetadata(bookmark)) return true;
      const currentSummary = getCurrentPostSummary(bookmark?.id);
      return Boolean(
        currentSummary && hasVolatileCoverMetadataChanged(bookmark, currentSummary)
      );
    }

    function hasStaleMetadata() {
      return readBookmarks().some(needsMetadataHydration);
    }

    // Backward-compatible alias for older page bundles during atomic deploys.
    const hasLegacyMetadata = hasStaleMetadata;

    function parseSerializedTags(value) {
      if (typeof value !== "string" || !value.trim()) return [];

      try {
        return normalizeTags(JSON.parse(value));
      } catch (error) {
        return [];
      }
    }

    function createBookmarkEntry(
      source,
      { timestamp = Date.now(), metadataRefreshedAt = source?.metadataRefreshedAt ?? Date.now() } = {},
    ) {
      return normalizeBookmark({
        id: source?.id,
        title: source?.title || "",
        category: source?.category || "",
        excerpt: source?.excerpt || "",
        date: source?.date || "",
        updatedAt: source?.updatedAt || "",
        readTime: source?.readTime || "",
        coverImage: source?.coverImage || null,
        coverImageSignature: source?.coverImageSignature || "",
        coverEmoji: source?.coverEmoji || "📝",
        coverGradient: source?.coverGradient || null,
        tags: Array.isArray(source?.tags) ? source.tags : [],
        metadataVersion: source?.metadataVersion ?? BOOKMARK_METADATA_HYDRATION_GENERATION,
        metadataRefreshedAt: source?.isPartial ? 0 : metadataRefreshedAt,
        timestamp,
      });
    }

    function buildCardBookmarkSource(card, postId) {
      if (!card || typeof card.querySelector !== "function") {
        return null;
      }

      const coverPlaceholder = card.querySelector(".blog-card-cover-placeholder");
      const title = card.querySelector(".blog-card-title")?.textContent || "";
      const excerpt = card.querySelector(".blog-card-excerpt")?.textContent || "";
      const category = card.querySelector(".blog-card-category")?.textContent || "";
      const tags = parseSerializedTags(card.dataset?.postTags);
      const metaSpans = card.querySelectorAll(".blog-card-meta > span");
      const date = metaSpans[0]?.textContent?.trim() || "";
      const readTime = metaSpans[1]?.textContent?.trim() || "";
      const img = card.querySelector(".blog-card-cover-img img");
      const emoji = card.querySelector(".blog-card-cover-placeholder:not(.blog-card-cover-img) span");

      return {
        id: postId,
        // DOM text may contain formatted dates or a cover fallback. Keep it
        // readable immediately, then hydrate authoritative metadata.
        isPartial: true,
        title,
        excerpt,
        category,
        date,
        readTime,
        coverImage: img?.src || null,
        coverImageSignature: card.dataset?.coverSignature || "",
        coverEmoji: coverPlaceholder?.dataset?.coverEmoji || emoji?.textContent || "📝",
        coverGradient: coverPlaceholder?.dataset?.coverGradient || null,
        tags,
      };
    }

    function toggle(post) {
      const postId = normalizeBookmarkId(post?.id);
      if (!postId) return null;

      let bookmarks = getAll();
      const removed = bookmarks.find((bookmark) => bookmark.id === postId);
      const exists = Boolean(removed);

      if (exists) {
        bookmarks = bookmarks.filter((bookmark) => bookmark.id !== postId);
      } else {
        const normalizedBookmark = createBookmarkEntry({
          ...post,
          id: postId,
        });
        if (!normalizedBookmark) return null;
        bookmarks.unshift(normalizedBookmark);
      }

      if (!save(bookmarks)) return null;
      for (const [id, entry] of recentlyRemoved) {
        if (Date.now() - entry.removedAt > 5_000) recentlyRemoved.delete(id);
      }
      if (removed) {
        recentlyRemoved.delete(postId);
        recentlyRemoved.set(postId, { post: removed, removedAt: Date.now() });
        if (recentlyRemoved.size > 16) recentlyRemoved.delete(recentlyRemoved.keys().next().value);
      } else {
        recentlyRemoved.delete(postId);
      }
      dispatchBookmarksUpdated();
      return !exists;
    }

    function toggleById(postId) {
      const normalizedPostId = normalizeBookmarkId(postId);
      if (!normalizedPostId) return null;

      if (isBookmarked(normalizedPostId)) return toggle({ id: normalizedPostId });
      const removed = recentlyRemoved.get(normalizedPostId);
      const retained = removed && Date.now() - removed.removedAt <= 5_000 ? removed.post : null;
      const source = getCurrentPostSummary(normalizedPostId) || retained
        || buildCardBookmarkSource(document.querySelector(
          `[data-post-id="${escapeSelectorValue(normalizedPostId)}"]`,
        ), normalizedPostId)
        || getCurrentPostSummary(normalizedPostId, { allowPartial: true });
      return source ? toggle({ ...source, id: normalizedPostId }) : null;
    }

    async function hydrateMissingMetadata() {
      if (metadataHydrationPromise) {
        return metadataHydrationPromise;
      }

      const getPost = window.NotionAPI?.getPost;
      const getPostSummary = window.NotionAPI?.getPostSummary;
      if (typeof getPost !== "function" && typeof getPostSummary !== "function") {
        return false;
      }

      const bookmarks = getAll();
      const pendingHydration = bookmarks.filter(needsMetadataHydration);
      if (pendingHydration.length === 0) {
        return false;
      }

      metadataHydrationPromise = (async () => {
        // Collect hydrated entries by id so we can merge them onto whatever
        // localStorage looks like at save time. A concurrent toggle() during
        // the network await window would otherwise be overwritten by an
        // unconditional save(snapshot-from-T0).
        const hydratedById = new Map();

        for (const bookmark of pendingHydration) {
          let source = getCurrentPostSummary(bookmark.id);
          if (!source && typeof getPost === "function") {
            try {
              source = await getPost.call(window.NotionAPI, bookmark.id);
            } catch (error) {
              source = null;
            }
          }

          if (!source) {
            continue;
          }

          const hydratedBookmark = createBookmarkEntry({
            ...bookmark,
            ...source,
            metadataVersion: BOOKMARK_METADATA_HYDRATION_GENERATION,
          }, {
            timestamp: bookmark.timestamp,
            metadataRefreshedAt: Date.now(),
          });

          if (!hydratedBookmark) {
            continue;
          }

          hydratedById.set(hydratedBookmark.id, hydratedBookmark);
        }

        if (hydratedById.size === 0) {
          return false;
        }

        // Drop the in-memory cache so getAll() re-parses the latest localStorage
        // value — picks up any toggle() that landed during hydration.
        bookmarksCache = null;
        const currentBookmarks = getAll();
        const merged = currentBookmarks.map((entry) => {
          const hydratedEntry = hydratedById.get(entry.id);
          if (!hydratedEntry) return entry;

          // Another tab may finish a newer metadata refresh after this tab has
          // already received its response but before this merge reaches
          // localStorage. Never relabel that newer record with this older
          // response merely because our write happens last.
          if (entry.metadataRefreshedAt > hydratedEntry.metadataRefreshedAt) {
            return entry;
          }

          // A remove-then-readd of the same id during the request is a new user
          // action. Refresh its server metadata, but never restore the older
          // ordering timestamp captured before the network await.
          return {
            ...hydratedEntry,
            timestamp: entry.timestamp,
          };
        });

        if (!save(merged)) {
          return false;
        }

        return true;
      })().finally(() => {
        metadataHydrationPromise = null;
      });

      return metadataHydrationPromise;
    }

    function refreshBookmarksFromSerializedValue(value) {
      try {
        const parsed = JSON.parse(value || "[]");
        bookmarksCache = normalizeBookmarkCollection(parsed);
      } catch (error) {
        bookmarksCache = [];
      }
    }

    function bookmarkSnapshotKey(entries) {
      return JSON.stringify(Array.isArray(entries) ? entries : []);
    }

    function scheduleStorageBookmarksUpdated() {
      clearTimeout(storageSyncTimer);
      storageSyncTimer = setTimeout(() => {
        storageSyncTimer = null;
        dispatchBookmarksUpdated();
      }, 100);
    }

    window.addEventListener("storage", (event) => {
      if (event.key !== BOOKMARK_KEY) return;

      const previousKey = bookmarkSnapshotKey(bookmarksCache);
      refreshBookmarksFromSerializedValue(event.newValue);
      // Cross-tab storage events fire for any setItem with the same key, even
      // when the serialized value is byte-identical. Skip the dispatch if the
      // bookmark set hasn't actually changed — avoids spurious re-renders.
      if (previousKey === bookmarkSnapshotKey(bookmarksCache)) return;
      scheduleStorageBookmarksUpdated();
    });

    return {
      getAll,
      getDisplayEntries,
      isBookmarked,
      hasStaleMetadata,
      hasLegacyMetadata,
      hydrateMissingMetadata,
      toggle,
      toggleById,
    };
  })();

  window.BookmarkManager = BookmarkManager;
})();
