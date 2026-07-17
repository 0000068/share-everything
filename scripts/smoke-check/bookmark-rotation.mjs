import {
  assert,
  createStorageMock,
  loadBrowserScript,
} from "./harness.mjs";

const BOOKMARK_KEY = "bookmarked_posts";
const CURRENT_METADATA_GENERATION = 6;
const METADATA_FRESHNESS_MS = 1000 * 60 * 30;
const NOTION_POST_ID_PATTERN = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

class BookmarkCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

function createBookmarkHarness(entries, {
  getPostSummary = () => null,
  getPost = async () => null,
} = {}) {
  const localStorage = createStorageMock({
    [BOOKMARK_KEY]: JSON.stringify(entries),
  });
  const harness = loadBrowserScript("js/bookmark.js", {
    localStorage,
    window: {
      CSS: {
        escape: (value) => String(value),
      },
      CustomEvent: BookmarkCustomEvent,
      addEventListener: () => {},
      dispatchEvent: () => true,
      NotionAPI: {
        getPostSummary,
        getPost,
      },
      SiteUtils: {
        resolveDisplayImageUrl: (value) => (
          typeof value === "string" && value.startsWith("https://") ? value : null
        ),
        sanitizeImageUrl: () => null,
        sanitizeCoverBackground: (value) => value,
        normalizeImageProxySignature: (value) => (
          typeof value === "string" ? value.trim() : ""
        ),
        normalizePostId: (value) => {
          if (typeof value !== "string") return null;
          const normalized = value.trim();
          return NOTION_POST_ID_PATTERN.test(normalized)
            ? normalized.replace(/-/g, "").toLowerCase()
            : null;
        },
      },
    },
  });

  return {
    manager: harness.window.BookmarkManager,
    readPersisted: () => JSON.parse(localStorage.getItem(BOOKMARK_KEY)),
    writePersisted: (nextEntries) => {
      localStorage.setItem(BOOKMARK_KEY, JSON.stringify(nextEntries));
    },
  };
}

async function runBookmarkRotationChecks() {
  const now = Date.now();
  const oldSignature = "o".repeat(43);
  const currentSignature = "n".repeat(43);
  const coverImage = "https://assets.example.com/rotated-cover.png";
  const persistentEntry = {
    id: "rotation-bookmark",
    title: "Keep this bookmark",
    tags: ["Persistent user state"],
    coverImage,
    coverImageSignature: oldSignature,
    coverEmoji: "📙",
    coverGradient: "linear-gradient(135deg, #111111, #222222)",
    metadataVersion: CURRENT_METADATA_GENERATION,
    metadataRefreshedAt: now,
    timestamp: now - 10_000,
  };
  const currentSummary = {
    id: persistentEntry.id,
    coverImage,
    coverImageSignature: currentSignature,
  };
  const refreshHarness = createBookmarkHarness([persistentEntry], {
    getPostSummary: () => currentSummary,
  });

  assert.equal(
    refreshHarness.manager.getDisplayEntries()[0]?.coverImageSignature,
    currentSignature,
    "current-generation bookmarks should immediately use a fresh summary signature after key rotation",
  );
  assert.equal(
    refreshHarness.manager.hasStaleMetadata(),
    true,
    "a summary signature mismatch should trigger hydration even at the current metadata generation",
  );
  assert.equal(
    await refreshHarness.manager.hydrateMissingMetadata(),
    true,
    "signature-only metadata changes should be persisted",
  );
  const refreshedEntry = refreshHarness.readPersisted()[0];
  assert.equal(refreshedEntry.coverImageSignature, currentSignature);
  assert.equal(
    refreshedEntry.title,
    persistentEntry.title,
    "signature hydration should preserve content absent from the volatile summary",
  );
  assert.deepEqual(refreshedEntry.tags, persistentEntry.tags);
  assert.equal(
    refreshedEntry.timestamp,
    persistentEntry.timestamp,
    "signature hydration should preserve the bookmark's user-order timestamp",
  );
  assert.ok(
    refreshedEntry.metadataRefreshedAt >= persistentEntry.metadataRefreshedAt,
    "successful hydration should advance the independent metadata freshness marker",
  );

  const clearHarness = createBookmarkHarness([persistentEntry], {
    getPostSummary: () => ({
      id: persistentEntry.id,
      coverImage: null,
      coverImageSignature: "",
    }),
  });
  const clearedDisplayEntry = clearHarness.manager.getDisplayEntries()[0];
  assert.equal(
    clearedDisplayEntry.coverImage,
    null,
    "an authoritative summary should clear a removed cover rather than retain an old signed URL",
  );
  assert.equal(clearedDisplayEntry.coverImageSignature, "");
  assert.equal(
    await clearHarness.manager.hydrateMissingMetadata(),
    true,
    "current-generation bookmarks should persist authoritative signature removal",
  );
  const clearedPersistedEntry = clearHarness.readPersisted()[0];
  assert.equal(clearedPersistedEntry.coverImage, null);
  assert.equal(clearedPersistedEntry.coverImageSignature, "");
  assert.equal(clearedPersistedEntry.title, persistentEntry.title);

  let offlineFetchCount = 0;
  const staleEntry = {
    ...persistentEntry,
    id: "offline-rotation-bookmark",
    title: "Offline bookmark stays",
    tags: ["Offline"],
    coverEmoji: "📗",
    metadataRefreshedAt: now - METADATA_FRESHNESS_MS - 1,
  };
  const offlineHarness = createBookmarkHarness([staleEntry], {
    async getPost() {
      offlineFetchCount += 1;
      throw new Error("offline");
    },
  });
  const offlineDisplayEntry = offlineHarness.manager.getDisplayEntries()[0];
  assert.equal(offlineDisplayEntry.coverImage, null);
  assert.equal(offlineDisplayEntry.coverImageSignature, "");
  assert.equal(offlineDisplayEntry.coverEmoji, staleEntry.coverEmoji);
  assert.equal(
    await offlineHarness.manager.hydrateMissingMetadata(),
    false,
    "offline refresh failure should remain retryable instead of marking stale metadata fresh",
  );
  assert.equal(offlineFetchCount, 1);
  const persistedOfflineEntry = offlineHarness.readPersisted()[0];
  assert.equal(
    persistedOfflineEntry.coverImageSignature,
    oldSignature,
    "offline fallback should not destructively rewrite persisted bookmark data",
  );
  assert.equal(persistedOfflineEntry.title, staleEntry.title);
  assert.deepEqual(persistedOfflineEntry.tags, staleEntry.tags);

  let resolveConcurrentPost;
  const concurrentEntry = {
    ...staleEntry,
    id: "concurrent-rotation-bookmark",
    timestamp: now - 60_000,
  };
  const concurrentHarness = createBookmarkHarness([concurrentEntry], {
    getPost: () => new Promise((resolve) => {
      resolveConcurrentPost = resolve;
    }),
  });
  const concurrentHydration = concurrentHarness.manager.hydrateMissingMetadata();
  assert.equal(concurrentHarness.manager.toggle(concurrentEntry), false);
  assert.equal(concurrentHarness.manager.toggle({
    ...concurrentEntry,
    title: "Re-added while refreshing",
  }), true);
  const readdedTimestamp = concurrentHarness.manager.getAll()[0].timestamp;
  resolveConcurrentPost({
    ...concurrentEntry,
    title: "Current server metadata",
    coverImageSignature: currentSignature,
  });
  assert.equal(await concurrentHydration, true);
  const concurrentlyHydratedEntry = concurrentHarness.readPersisted()[0];
  assert.equal(
    concurrentlyHydratedEntry.timestamp,
    readdedTimestamp,
    "hydration should preserve the ordering timestamp of a same-id bookmark re-added during its request",
  );
  assert.equal(concurrentlyHydratedEntry.title, "Current server metadata");
  assert.equal(concurrentlyHydratedEntry.coverImageSignature, currentSignature);

  let resolveOlderCrossTabPost;
  const crossTabEntry = {
    ...staleEntry,
    id: "cross-tab-rotation-bookmark",
    timestamp: now - 90_000,
  };
  const crossTabHarness = createBookmarkHarness([crossTabEntry], {
    getPost: () => new Promise((resolve) => {
      resolveOlderCrossTabPost = resolve;
    }),
  });
  const crossTabHydration = crossTabHarness.manager.hydrateMissingMetadata();
  const newerCrossTabEntry = {
    ...crossTabEntry,
    title: "Newer metadata from another tab",
    coverImageSignature: currentSignature,
    metadataRefreshedAt: now + 60_000,
  };
  crossTabHarness.writePersisted([newerCrossTabEntry]);
  resolveOlderCrossTabPost({
    ...crossTabEntry,
    title: "Older in-flight response",
    coverImageSignature: "s".repeat(43),
  });
  assert.equal(await crossTabHydration, true);
  const crossTabMergedEntry = crossTabHarness.readPersisted()[0];
  assert.equal(
    crossTabMergedEntry.title,
    newerCrossTabEntry.title,
    "an older in-flight response should not overwrite newer same-id metadata from another tab",
  );
  assert.equal(crossTabMergedEntry.coverImageSignature, currentSignature);
  assert.equal(crossTabMergedEntry.metadataRefreshedAt, newerCrossTabEntry.metadataRefreshedAt);
  assert.equal(
    crossTabMergedEntry.timestamp,
    crossTabEntry.timestamp,
    "cross-tab metadata conflict resolution should preserve the bookmark ordering timestamp",
  );

  const uppercaseHyphenatedId = "550E8400-E29B-41D4-A716-446655440000";
  const compactId = "550e8400e29b41d4a716446655440000";
  const canonicalHarness = createBookmarkHarness([{
    ...persistentEntry,
    id: uppercaseHyphenatedId,
  }]);
  assert.equal(
    canonicalHarness.manager.getAll()[0]?.id,
    compactId,
    "legacy uppercase/hyphenated Notion ids should normalize on bookmark read",
  );
  assert.equal(
    canonicalHarness.manager.isBookmarked(compactId),
    true,
    "compact routes should find a persisted legacy UUID bookmark",
  );
  assert.equal(
    canonicalHarness.manager.toggle({ id: compactId }),
    false,
    "toggle should remove the legacy UUID bookmark instead of adding a duplicate compact id",
  );
  assert.deepEqual(canonicalHarness.readPersisted(), []);
  assert.equal(
    canonicalHarness.manager.toggle({
      ...persistentEntry,
      id: uppercaseHyphenatedId,
    }),
    true,
  );
  assert.equal(canonicalHarness.readPersisted()[0]?.id, compactId);
  assert.equal(
    canonicalHarness.manager.toggleById(compactId),
    false,
    "toggleById should use the same canonical comparison key as persisted bookmark normalization",
  );
  assert.deepEqual(canonicalHarness.readPersisted(), []);

  const duplicateCanonicalHarness = createBookmarkHarness([
    {
      ...persistentEntry,
      id: uppercaseHyphenatedId,
    },
    {
      ...persistentEntry,
      id: compactId,
    },
  ]);
  assert.equal(
    duplicateCanonicalHarness.manager.getAll().length,
    1,
    "legacy UUID aliases should collapse to one in-memory bookmark during migration",
  );
}

export { runBookmarkRotationChecks };
