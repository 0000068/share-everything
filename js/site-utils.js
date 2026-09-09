(() => {
  // URL helpers load after this module on both listing and article routes.
  // Resolve them at call time without requiring the full article renderer.
  const sharedConstants = window.NotionContentShared || {};
  function getNotionContent() {
    return window.NotionContentUrl || window.NotionContent || sharedConstants;
  }
  const BLOG_RETURN_URL_STORAGE_KEY = "spa:last-blog-url";
  const BOOKMARK_HASH_PREFIX = "#bookmarks";
  const PUBLIC_SEARCH_QUERY_MAX_LENGTH = 256;
  const NOTION_POST_ID_PATTERN = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
  const MOBILE_DEVICE_QUERY = "(max-width: 768px) and (hover: none) and (pointer: coarse)";
  const MOBILE_DEVICE_CLASS = "is-mobile-device-viewport";
  const MOBILE_DEVICE_WIDTH = 768;
  const DEFAULT_SITE_NAME = sharedConstants.DEFAULT_SITE_NAME || "Site";

  function readMetaContent(selector) {
    if (typeof document !== "object" || !document || typeof document.querySelector !== "function") {
      return "";
    }

    return document.querySelector(selector)?.content?.trim() || "";
  }

  function readSiteName() {
    return (
      readMetaContent('meta[name="application-name"]') ||
      readMetaContent('meta[property="og:image:alt"]') ||
      DEFAULT_SITE_NAME
    );
  }

  const SITE_NAME = readSiteName();

  function getSiteName() {
    return SITE_NAME;
  }

  function createMediaQueryList(query) {
    if (typeof window.matchMedia === "function") {
      return window.matchMedia(query);
    }

    return {
      matches: false,
      addEventListener: null,
      removeEventListener: null,
      addListener: () => {},
      removeListener: () => {},
    };
  }

  function createMobileDeviceQueryList() {
    return createMediaQueryList(MOBILE_DEVICE_QUERY);
  }

  function hasTouchInput() {
    const nav = window.navigator || {};
    const hasFinePointer = createMediaQueryList("(pointer: fine)").matches
      || createMediaQueryList("(any-pointer: fine)").matches;
    if (hasFinePointer) return false;

    return Boolean(nav.maxTouchPoints > 0 || "ontouchstart" in window);
  }

  function isNarrowViewport() {
    const viewportWidth = Math.min(
      window.innerWidth || Number.POSITIVE_INFINITY,
      document.documentElement?.clientWidth || Number.POSITIVE_INFINITY,
    );
    return viewportWidth <= MOBILE_DEVICE_WIDTH;
  }

  function isMobileDeviceViewport() {
    return createMobileDeviceQueryList().matches || (isNarrowViewport() && hasTouchInput());
  }

  function syncMobileDeviceViewportClass() {
    document.documentElement?.classList?.toggle(MOBILE_DEVICE_CLASS, isMobileDeviceViewport());
  }

  function bindMobileDeviceViewportClass() {
    syncMobileDeviceViewportClass();

    const mobileQuery = createMobileDeviceQueryList();
    const handleChange = () => syncMobileDeviceViewportClass();
    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", handleChange);
    } else if (typeof mobileQuery.addListener === "function") {
      mobileQuery.addListener(handleChange);
    }

    window.addEventListener?.("resize", handleChange, { passive: true });
    window.addEventListener?.("orientationchange", handleChange, { passive: true });
  }

  function sanitizeImageUrl(candidate) {
    const notionContent = getNotionContent();
    if (typeof notionContent.resolveDisplayImageUrl === "function") {
      return notionContent.resolveDisplayImageUrl(candidate, window.location.origin);
    }

    if (!candidate || typeof candidate !== "string") return null;

    try {
      const parsed = new URL(candidate, window.location.origin);
      return parsed.protocol === "https:" || parsed.origin === window.location.origin
        ? parsed.href
        : null;
    } catch (error) {
      return null;
    }
  }

  // Client-side simplified alias. Uses window.location.origin internally
  // instead of the shared NotionContent module's baseOrigin parameter.
  const resolveDisplayImageUrl = sanitizeImageUrl;

  function resolveProxiedDisplayImageUrl(candidate) {
    const notionContent = getNotionContent();
    if (typeof notionContent.resolveProxiedDisplayImageUrl === "function") {
      return notionContent.resolveProxiedDisplayImageUrl(candidate, window.location.origin);
    }

    return sanitizeImageUrl(candidate);
  }

  function resolveCoverImageUrl(candidate, options = {}) {
    const notionContent = getNotionContent();
    if (typeof notionContent.resolveCoverImageUrl === "function") {
      return notionContent.resolveCoverImageUrl(candidate, window.location.origin, options);
    }

    return resolveProxiedDisplayImageUrl(candidate);
  }

  function buildCoverImageSrcSet(candidate, options = {}) {
    const notionContent = getNotionContent();
    if (typeof notionContent.buildCoverImageSrcSet === "function") {
      return notionContent.buildCoverImageSrcSet(candidate, window.location.origin, options);
    }

    return "";
  }

  function normalizeImageProxySignature(signature) {
    const notionContent = getNotionContent();
    return typeof notionContent.normalizeImageProxySignature === "function"
      ? notionContent.normalizeImageProxySignature(signature)
      : "";
  }

  function sanitizeCoverBackground(value, fallback = null) {
    if (typeof value !== "string") return fallback;

    const trimmed = value.trim();
    const isGradient = /^(linear-gradient|radial-gradient)\([#(),.%\sa-zA-Z0-9+-]+\)$/.test(trimmed);
    if (!trimmed || !isGradient) return fallback;
    if (trimmed.includes(";") || /url\s*\(/i.test(trimmed)) return fallback;
    return trimmed;
  }

  function isLikelyEphemeralAssetUrl(candidate) {
    const notionContent = getNotionContent();
    if (typeof notionContent.isLikelyEphemeralAssetUrl === "function") {
      return notionContent.isLikelyEphemeralAssetUrl(candidate, window.location.origin);
    }

    if (!candidate || typeof candidate !== "string") return false;

    try {
      const parsed = new URL(candidate, window.location.href);
      const expiringQueryKeys = [
        "X-Amz-Algorithm",
        "X-Amz-Credential",
        "X-Amz-Date",
        "X-Amz-Expires",
        "X-Amz-Signature",
        "Expires",
        "Signature",
      ];

      return expiringQueryKeys.some((key) => parsed.searchParams.has(key));
    } catch (error) {
      return false;
    }
  }

  function resolveShareImageUrl(candidate, fallback = null) {
    const notionContent = getNotionContent();
    if (typeof notionContent.resolveShareImageUrl === "function") {
      return notionContent.resolveShareImageUrl(candidate, fallback, window.location.origin);
    }

    const safeUrl = sanitizeImageUrl(candidate);
    if (!safeUrl || isLikelyEphemeralAssetUrl(safeUrl)) {
      return fallback;
    }

    return safeUrl;
  }

  function normalizePostId(value) {
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    return NOTION_POST_ID_PATTERN.test(normalized)
      ? normalized.replace(/-/g, "").toLowerCase()
      : null;
  }

  function normalizePostIdComparisonKey(value) {
    return normalizePostId(value) || "";
  }

  function arePostIdsEquivalent(left, right) {
    const leftKey = normalizePostIdComparisonKey(left);
    return Boolean(leftKey) && leftKey === normalizePostIdComparisonKey(right);
  }

  function getPostIdFromUrl(url = window.location.href) {
    try {
      const resolved = new URL(url, window.location.origin);
      const pathMatch = resolved.pathname.match(/^\/posts\/([^/?#]+)\/?$/);
      if (pathMatch?.[1]) {
        return normalizePostId(decodeURIComponent(pathMatch[1]));
      }

      if (resolved.pathname.endsWith("/post.html")) {
        return normalizePostId(resolved.searchParams.get("id"));
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  function buildPostPath(postId) {
    const normalizedPostId = normalizePostId(postId);
    return normalizedPostId ? `/posts/${normalizedPostId}` : "/post.html";
  }

  function buildPostUrl(postId) {
    return new URL(buildPostPath(postId), window.location.origin).href;
  }

  function normalizePageNumber(value, fallback = 1) {
    const normalizedFallback = Number.isSafeInteger(Number(fallback)) && Number(fallback) > 0
      ? Number(fallback)
      : 1;
    const rawValue = String(value ?? "").trim();
    if (!/^\d+$/.test(rawValue)) {
      return normalizedFallback;
    }

    const parsed = Number(rawValue);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : normalizedFallback;
  }

  function normalizeBookmarkSearch(value) {
    return typeof value === "string" ? value.trim().slice(0, PUBLIC_SEARCH_QUERY_MAX_LENGTH) : "";
  }

  function buildBookmarkListingHash({ search = "", page = 1 } = {}) {
    const params = new URLSearchParams();
    const normalizedSearch = normalizeBookmarkSearch(search);
    const normalizedPage = normalizePageNumber(page, 1);

    if (normalizedSearch) {
      params.set("search", normalizedSearch);
    }
    if (normalizedPage > 1) {
      params.set("page", String(normalizedPage));
    }

    const hashQuery = params.toString();
    return `${BOOKMARK_HASH_PREFIX}${hashQuery ? `?${hashQuery}` : ""}`;
  }

  function buildBookmarkListingUrl({ search = "", page = 1, pathname = "/blog.html" } = {}) {
    const resolvedPathname = typeof pathname === "string" && pathname.trim()
      ? pathname.trim()
      : "/blog.html";

    return `${resolvedPathname}${buildBookmarkListingHash({ search, page })}`;
  }

  function isBookmarkListingHash(rawHash) {
    return rawHash === BOOKMARK_HASH_PREFIX || rawHash.startsWith(`${BOOKMARK_HASH_PREFIX}?`);
  }

  function parseBookmarkListingHash(hash = window.location.hash) {
    const rawHash = typeof hash === "string" ? hash.trim() : "";
    if (!isBookmarkListingHash(rawHash)) {
      return {
        active: false,
        search: "",
        page: 1,
        normalizedHash: "",
      };
    }

    const rawQuery = rawHash.slice(BOOKMARK_HASH_PREFIX.length).replace(/^\?/, "");
    const params = new URLSearchParams(rawQuery);
    const search = normalizeBookmarkSearch(params.get("search") || "");
    const page = normalizePageNumber(params.get("page"), 1);

    return {
      active: true,
      search,
      page,
      normalizedHash: buildBookmarkListingHash({ search, page }),
    };
  }

  function isBlogPageUrl(url = window.location.href) {
    try {
      const resolved = new URL(url, window.location.origin);
      if (resolved.origin !== window.location.origin) {
        return false;
      }

      const normalizedPath =
        resolved.pathname === "/"
          ? "/index.html"
          : resolved.pathname.endsWith("/")
            ? `${resolved.pathname}index.html`
            : resolved.pathname;

      return normalizedPath.endsWith("/blog.html");
    } catch (error) {
      return false;
    }
  }

  function rememberBlogReturnUrl(url = window.location.href) {
    if (!isBlogPageUrl(url)) {
      return null;
    }

    const resolved = new URL(url, window.location.origin).href;

    try {
      sessionStorage.setItem(BLOG_RETURN_URL_STORAGE_KEY, resolved);
    } catch (error) {
      // sessionStorage unavailable
    }

    return resolved;
  }

  function readStoredBlogReturnUrl() {
    try {
      const storedUrl = sessionStorage.getItem(BLOG_RETURN_URL_STORAGE_KEY);
      if (!storedUrl || !isBlogPageUrl(storedUrl)) {
        return null;
      }

      return new URL(storedUrl, window.location.origin).href;
    } catch (error) {
      return null;
    }
  }

  function getPreferredBlogReturnUrl({ fallback = "/blog.html" } = {}) {
    const rememberedUrl = readStoredBlogReturnUrl();
    if (rememberedUrl) {
      return rememberedUrl;
    }

    if (typeof document.referrer === "string" && isBlogPageUrl(document.referrer)) {
      try {
        return new URL(document.referrer, window.location.origin).href;
      } catch (error) {
        // Ignore invalid referrer and fall through to the default route.
      }
    }

    return new URL(fallback, window.location.origin).href;
  }

  window.SiteUtils = Object.freeze({
    arePostIdsEquivalent,
    buildBookmarkListingHash,
    buildBookmarkListingUrl,
    buildPostPath,
    buildPostUrl,
    createMobileDeviceQueryList,
    createMediaQueryList,
    getSiteName,
    getPreferredBlogReturnUrl,
    getPostIdFromUrl,
    isBlogPageUrl,
    isLikelyEphemeralAssetUrl,
    isMobileDeviceViewport,
    isNarrowViewport,
    normalizeImageProxySignature,
    normalizePageNumber,
    normalizePostId,
    normalizePostIdComparisonKey,
    parseBookmarkListingHash,
    rememberBlogReturnUrl,
    buildCoverImageSrcSet,
    resolveDisplayImageUrl,
    resolveCoverImageUrl,
    resolveProxiedDisplayImageUrl,
    resolveShareImageUrl,
    sanitizeCoverBackground,
    sanitizeImageUrl,
    syncMobileDeviceViewportClass,
  });

  bindMobileDeviceViewportClass();

  if (isBlogPageUrl(window.location.href)) {
    rememberBlogReturnUrl(window.location.href);
  }
})();
