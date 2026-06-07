/**
 * Shared bookmark (favorite) manager for `blog.html` and `post.html`.
 */

(() => {
  const BookmarkManager = (() => {
    const BOOKMARK_KEY = "bookmarked_posts";
    // Incrementing this value forces every client to re-hydrate Notion metadata
    // for previously-bookmarked posts on next access. This is NOT a real schema
    // version — there is no migration logic, just "stored entry lags hydration
    // generation → fetch fresh data on read". The stored property is still
    // named `metadataVersion` for backward compatibility with existing entries
    // in users' localStorage; do not rename the field.
    const BOOKMARK_METADATA_HYDRATION_GENERATION = 4;
    const siteUtils = window.SiteUtils || {};
    const resolveDisplayImageUrl = siteUtils.resolveDisplayImageUrl;
    const sanitizeImageUrl = siteUtils.sanitizeImageUrl;
    const sanitizeCoverBackground = siteUtils.sanitizeCoverBackground;
    let bookmarksCache = null;
    let metadataHydrationPromise = null;
    let storageSyncTimer = null;

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

    function normalizeBookmark(entry) {
      if (!entry || typeof entry !== "object") return null;

      const id = normalizeText(entry.id).trim();
      if (!id) return null;

      const title = normalizeText(entry.title);
      const excerpt = normalizeText(entry.excerpt);
      const tags = normalizeTags(entry.tags);
      const metadataVersion = Number.isFinite(Number(entry.metadataVersion))
        ? Number(entry.metadataVersion)
        : 1;

      return {
        id,
        title,
        category: normalizeText(entry.category),
        excerpt,
        date: normalizeText(entry.date),
        readTime: normalizeText(entry.readTime),
        coverImage: normalizePersistentCoverImage(entry.coverImage),
        coverEmoji: normalizeText(entry.coverEmoji, "📝"),
        coverGradient:
          typeof sanitizeCoverBackground === "function"
            ? sanitizeCoverBackground(entry.coverGradient)
            : null,
        tags,
        metadataVersion,
        timestamp: Number.isFinite(Number(entry.timestamp)) ? Number(entry.timestamp) : Date.now(),
      };
    }

    function readBookmarks() {
      if (bookmarksCache) return bookmarksCache;

      try {
        const parsed = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "[]");
        bookmarksCache = Array.isArray(parsed)
          ? parsed.map(normalizeBookmark).filter(Boolean)
          : [];
      } catch (error) {
        bookmarksCache = [];
      }

      return bookmarksCache;
    }

    function getAll() {
      return [...readBookmarks()];
    }

    function save(bookmarks) {
      const nextBookmarks = Array.isArray(bookmarks)
        ? bookmarks.map(normalizeBookmark).filter(Boolean)
        : [];

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
      return readBookmarks().some((bookmark) => bookmark.id === id);
    }

    function needsMetadataHydration(bookmark) {
      return Number(bookmark?.metadataVersion || 0) < BOOKMARK_METADATA_HYDRATION_GENERATION;
    }

    function hasLegacyMetadata() {
      return readBookmarks().some(needsMetadataHydration);
    }

    function parseSerializedTags(value) {
      if (typeof value !== "string" || !value.trim()) return [];

      try {
        return normalizeTags(JSON.parse(value));
      } catch (error) {
        return [];
      }
    }

    function createBookmarkEntry(source, { timestamp = Date.now() } = {}) {
      return normalizeBookmark({
        id: source?.id,
        title: source?.title || "",
        category: source?.category || "",
        excerpt: source?.excerpt || "",
        date: source?.date || "",
        readTime: source?.readTime || "",
        coverImage: source?.coverImage || null,
        coverEmoji: source?.coverEmoji || "📝",
        coverGradient: source?.coverGradient || null,
        tags: Array.isArray(source?.tags) ? source.tags : [],
        metadataVersion: BOOKMARK_METADATA_HYDRATION_GENERATION,
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
        title,
        excerpt,
        category,
        date,
        readTime,
        coverImage: img?.src || null,
        coverEmoji: coverPlaceholder?.dataset?.coverEmoji || emoji?.textContent || "📝",
        coverGradient: coverPlaceholder?.dataset?.coverGradient || null,
        tags,
      };
    }

    function toggle(post) {
      let bookmarks = getAll();
      const exists = bookmarks.some((bookmark) => bookmark.id === post.id);

      if (exists) {
        bookmarks = bookmarks.filter((bookmark) => bookmark.id !== post.id);
      } else {
        const normalizedBookmark = createBookmarkEntry(post);
        if (!normalizedBookmark) return null;
        bookmarks.unshift(normalizedBookmark);
      }

      if (!save(bookmarks)) return null;
      dispatchBookmarksUpdated();
      return !exists;
    }

    function toggleById(postId) {
      let bookmarks = getAll();
      const exists = bookmarks.some((bookmark) => bookmark.id === postId);
      let didPersist = false;

      if (exists) {
        bookmarks = bookmarks.filter((bookmark) => bookmark.id !== postId);
        didPersist = true;
      } else {
        const cachedSummary = window.NotionAPI?.getPostSummary?.(postId);
        if (cachedSummary) {
          const normalizedBookmark = createBookmarkEntry(cachedSummary);
          if (normalizedBookmark) {
            bookmarks.unshift(normalizedBookmark);
            didPersist = true;
          }
        } else {
          const card = document.querySelector(`[data-post-id="${escapeSelectorValue(postId)}"]`);
          const normalizedBookmark = createBookmarkEntry(buildCardBookmarkSource(card, postId));
          if (normalizedBookmark) {
            bookmarks.unshift(normalizedBookmark);
            didPersist = true;
          }
        }
      }

      if (!didPersist) return null;
      if (!save(bookmarks)) return null;
      dispatchBookmarksUpdated();
      return !exists;
    }

    async function hydrateMissingMetadata() {
      if (metadataHydrationPromise) {
        return metadataHydrationPromise;
      }

      if (typeof window.NotionAPI?.getPost !== "function") {
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
          let source = window.NotionAPI?.getPostSummary?.(bookmark.id) || null;
          if (!source) {
            try {
              source = await window.NotionAPI.getPost(bookmark.id);
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
          }, {
            timestamp: bookmark.timestamp,
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
        const merged = currentBookmarks.map((entry) => (
          hydratedById.get(entry.id) || entry
        ));

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
        bookmarksCache = Array.isArray(parsed)
          ? parsed.map(normalizeBookmark).filter(Boolean)
          : [];
      } catch (error) {
        bookmarksCache = [];
      }
    }

    const BOOKMARK_SNAPSHOT_FIELD_SEPARATOR = "\u0000";
    const BOOKMARK_SNAPSHOT_ENTRY_SEPARATOR = "\u0001";

    function bookmarkSnapshotKey(entries) {
      return (entries || [])
        .map((entry) => `${entry.id}${BOOKMARK_SNAPSHOT_FIELD_SEPARATOR}${entry.timestamp}`)
        .join(BOOKMARK_SNAPSHOT_ENTRY_SEPARATOR);
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
      isBookmarked,
      hasLegacyMetadata,
      hydrateMissingMetadata,
      toggle,
      toggleById,
    };
  })();

  window.BookmarkManager = BookmarkManager;
})();
