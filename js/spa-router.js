(() => {
  const siteUtils = window.SiteUtils || {};
  const updateSeoMeta =
    typeof window.updateSeoMeta === "function"
      ? window.updateSeoMeta
      : () => {};
  const PageProgress = window.PageProgress || Object.freeze({
    start() {},
    finish() {},
  });
  const PageRuntime = window.PageRuntime || Object.freeze({
    getPageIdFromUrl: () => null,
    initializePage: () => null,
    cleanupCurrentPage: () => {},
    register: () => {},
  });
  const focusSpaContent = typeof window.focusSpaContent === "function"
    ? window.focusSpaContent
    : () => null;
  const DEFAULT_OG_IMAGE_URL = new URL(
    (window.NotionContentShared?.DEFAULT_SHARE_IMAGE_PATH || "/og-image.jpg?v=4"),
    window.location.origin,
  ).href;
  const DEFAULT_OG_IMAGE_ALT =
    typeof siteUtils.getSiteName === "function" ? siteUtils.getSiteName() : "Site";
  const connectionInfo = navigator.connection || null;
  const getPostIdFromUrl =
    typeof siteUtils.getPostIdFromUrl === "function"
      ? siteUtils.getPostIdFromUrl
      : () => null;
  const buildPostUrl =
    typeof siteUtils.buildPostUrl === "function"
      ? siteUtils.buildPostUrl
      : (postId) => new URL(`/posts/${encodeURIComponent(postId)}`, window.location.origin).href;
  const rememberBlogReturnUrl =
    typeof siteUtils.rememberBlogReturnUrl === "function"
      ? siteUtils.rememberBlogReturnUrl
      : () => null;
  const ROUTE_EXIT_TRANSITION = "opacity 0.15s ease, transform 0.15s ease";
  const ROUTE_ENTER_TRANSITION = "opacity 0.25s ease, transform 0.25s var(--transition-smooth)";
  const ROUTE_EXIT_TRANSFORM = "translateY(-8px)";
  const ROUTE_ENTER_START_TRANSFORM = "translateY(12px)";
  const ROUTE_ENTER_END_TRANSFORM = "translateY(0)";
  const ROUTE_TRANSITION_RESET_MS = 300;
  const ROUTE_EXIT_CUE_MS = 150;
  const ROUTE_LOCAL_POST_FALLBACK_MS = 700;
  const ROUTE_STUCK_FALLBACK_MS = 2500;

  const SPARouter = (() => {
    let navigationToken = 0;
    let activeNavigationController = null;
    const loadedStylesheets = new Set();
    const MAX_PAGE_CACHE_ENTRIES = 6;
    const MAX_PAGE_CACHE_BYTES = 2 * 1024 * 1024;
    const MAX_PER_ENTRY_CACHE_BYTES = 1 * 1024 * 1024;
    const MAX_PENDING_PAGE_FETCHES = 4;
    const PAGE_CACHE_TTL_MS = 1000 * 60 * 5;
    const pageCache = new Map();
    let pageCacheTotalBytes = 0;
    const prefetched = new Map();
    const pendingPageFetches = new Map();

    function estimateHtmlByteSize(html) {
      // JS strings are UTF-16 in memory; the byte estimate is conservative for
      // UTF-8 wire size but close enough for cache budgeting.
      return typeof html === "string" ? html.length * 2 : 0;
    }

    function dropCacheEntry(cacheKey) {
      const entry = pageCache.get(cacheKey);
      if (!entry) return;
      pageCache.delete(cacheKey);
      prefetched.delete(cacheKey);
      pageCacheTotalBytes -= entry.byteSize || 0;
      if (pageCacheTotalBytes < 0) pageCacheTotalBytes = 0;
    }

    function evictOldestCacheEntry() {
      const oldestCacheKey = pageCache.keys().next().value;
      if (!oldestCacheKey) return false;
      dropCacheEntry(oldestCacheKey);
      return true;
    }

    function canWarmResources() {
      return !(connectionInfo?.saveData || /(^|-)2g$/.test(connectionInfo?.effectiveType || ""));
    }

    function normalizeSiteUrl(url) {
      const resolved = new URL(url, window.location.href);
      if (resolved.origin === window.location.origin && resolved.pathname === "/index.html") {
        resolved.pathname = "/";
      }
      return resolved;
    }

    function resolveUrl(url) {
      return normalizeSiteUrl(url);
    }

    function getRouteKey(url) {
      const resolved = resolveUrl(url);
      const postId = getPostIdFromUrl(resolved.href);
      if (postId) {
        return buildPostUrl(postId);
      }
      resolved.hash = "";
      return resolved.href;
    }

    function getPageCacheKey(url) {
      const resolved = resolveUrl(getRouteKey(url));
      const pageId = PageRuntime.getPageIdFromUrl(resolved.href);
      if (pageId && pageId !== "post") {
        resolved.search = "";
      }

      return resolved.href;
    }

    function isRouteHtmlCacheable(url) {
      return PageRuntime.getPageIdFromUrl(url) !== "post";
    }

    function buildPostTemplateFallbackUrl(url) {
      const resolved = resolveUrl(url);
      const postId = getPostIdFromUrl(resolved.href);
      if (!postId) return null;

      const templateUrl = new URL("/post.html", resolved.origin);
      templateUrl.searchParams.set("id", postId);
      return templateUrl.href;
    }

    function shouldUsePostTemplateFallbackFirst(url) {
      const resolved = resolveUrl(url);
      if (!buildPostTemplateFallbackUrl(resolved.href)) return false;

      return ["localhost", "127.0.0.1", "::1"].includes(resolved.hostname);
    }

    async function requestPageHtml(url, { signal, ignoreSignal = false } = {}) {
      const response = await fetch(url, {
        cache: "no-store",
        signal: ignoreSignal ? undefined : signal,
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        error.url = url;
        throw error;
      }

      return response.text();
    }

    async function requestRouteHtml(routeKey, { signal, ignoreSignal = false } = {}) {
      const fallbackUrl = buildPostTemplateFallbackUrl(routeKey);
      if (fallbackUrl && shouldUsePostTemplateFallbackFirst(routeKey)) {
        return requestPageHtml(fallbackUrl, { signal, ignoreSignal });
      }

      try {
        return await requestPageHtml(routeKey, { signal, ignoreSignal });
      } catch (error) {
        if (error?.status !== 404 || !fallbackUrl) throw error;

        return requestPageHtml(fallbackUrl, { signal, ignoreSignal: false });
      }
    }

    function rememberPageHtml(cacheKey, html) {
      const byteSize = estimateHtmlByteSize(html);
      if (byteSize > MAX_PER_ENTRY_CACHE_BYTES) {
        // Outsized payloads bypass the cache entirely; storing one would push
        // every smaller entry out and we would replay this fetch anyway.
        dropCacheEntry(cacheKey);
        return;
      }

      dropCacheEntry(cacheKey);
      pageCache.set(cacheKey, {
        html,
        cachedAt: Date.now(),
        byteSize,
      });
      pageCacheTotalBytes += byteSize;

      while (
        pageCache.size > MAX_PAGE_CACHE_ENTRIES
        || pageCacheTotalBytes > MAX_PAGE_CACHE_BYTES
      ) {
        if (!evictOldestCacheEntry()) break;
      }
    }

    function readPageHtmlFromCache(cacheKey) {
      const entry = pageCache.get(cacheKey);
      if (!entry) return null;

      if (
        typeof entry.html !== "string" ||
        !Number.isFinite(entry.cachedAt) ||
        Date.now() - entry.cachedAt >= PAGE_CACHE_TTL_MS
      ) {
        dropCacheEntry(cacheKey);
        return null;
      }

      pageCache.delete(cacheKey);
      pageCache.set(cacheKey, entry);
      return entry.html;
    }

    function rememberPrefetchedPage(cacheKey) {
      if (prefetched.has(cacheKey)) {
        prefetched.delete(cacheKey);
      }
      prefetched.set(cacheKey, Date.now());

      while (prefetched.size > MAX_PAGE_CACHE_ENTRIES) {
        const oldestPrefetchedKey = prefetched.keys().next().value;
        if (!oldestPrefetchedKey) break;
        prefetched.delete(oldestPrefetchedKey);
      }
    }

    function hasFreshPrefetch(cacheKey) {
      const prefetchedAt = prefetched.get(cacheKey);
      if (!Number.isFinite(prefetchedAt)) {
        prefetched.delete(cacheKey);
        return false;
      }

      if (Date.now() - prefetchedAt >= PAGE_CACHE_TTL_MS) {
        prefetched.delete(cacheKey);
        return false;
      }

      return true;
    }

    function ensureStylesheet(href) {
      const resolvedHref = resolveUrl(href).href;
      const existingLink = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(
        (link) => link.href === resolvedHref,
      );
      const hasStylesheet = loadedStylesheets.has(resolvedHref) || Boolean(existingLink);

      if (hasStylesheet) {
        loadedStylesheets.add(resolvedHref);
        if (
          existingLink instanceof HTMLLinkElement &&
          existingLink.hasAttribute("data-deferred-fonts") &&
          existingLink.media === "print"
        ) {
          existingLink.media = "all";
          existingLink.dataset.fontsActivated = "true";
        }
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = resolvedHref;
        link.onload = () => {
          loadedStylesheets.add(resolvedHref);
          resolve();
        };
        link.onerror = () => {
          loadedStylesheets.add(resolvedHref);
          resolve();
        };
        document.head.appendChild(link);
      });
    }

    async function fetchPageHtml(url, { signal } = {}) {
      const routeKey = getRouteKey(url);
      const cacheKey = getPageCacheKey(routeKey);
      const canCacheHtml = isRouteHtmlCacheable(routeKey);
      if (!canCacheHtml) {
        dropCacheEntry(cacheKey);
      }

      const cachedHtml = canCacheHtml ? readPageHtmlFromCache(cacheKey) : null;
      if (cachedHtml) {
        return cachedHtml;
      }

      if (canCacheHtml) {
        const pendingFetch = pendingPageFetches.get(cacheKey);
        if (pendingFetch) {
          return pendingFetch;
        }
      }

      const loadPageHtml = async () => {
        const html = await requestRouteHtml(routeKey, {
          signal,
          ignoreSignal: canCacheHtml,
        });
        if (canCacheHtml) {
          rememberPageHtml(cacheKey, html);
        }
        return html;
      };

      if (canCacheHtml) {
        const pendingFetch = loadPageHtml().finally(() => {
          if (pendingPageFetches.get(cacheKey) === pendingFetch) {
            pendingPageFetches.delete(cacheKey);
          }
        });
        pendingPageFetches.set(cacheKey, pendingFetch);
        return pendingFetch;
      }

      return requestRouteHtml(routeKey, {
        signal,
      });
    }

    function warmPage(url) {
      if (!canWarmResources()) return;
      const routeKey = getRouteKey(url);
      if (!isRouteHtmlCacheable(routeKey)) return;

      const cacheKey = getPageCacheKey(routeKey);
      if (hasFreshPrefetch(cacheKey) || readPageHtmlFromCache(cacheKey)) return;
      if (pendingPageFetches.size >= MAX_PENDING_PAGE_FETCHES) return;

      rememberPrefetchedPage(cacheKey);
      fetchPageHtml(routeKey).catch(() => {
        prefetched.delete(cacheKey);
      });
    }

    function waitForRouteExitCue() {
      return new Promise((resolve) => setTimeout(resolve, ROUTE_EXIT_CUE_MS));
    }

    function getNavigationFallbackUrl(routeKey) {
      return buildPostTemplateFallbackUrl(routeKey) || routeKey;
    }

    function getRouteStuckFallbackMs(routeKey) {
      return shouldUsePostTemplateFallbackFirst(routeKey)
        ? ROUTE_LOCAL_POST_FALLBACK_MS
        : ROUTE_STUCK_FALLBACK_MS;
    }

    async function navigate(url, pushState = true) {
      const content = document.getElementById("spa-content");
      if (!content) {
        window.location.href = url;
        return;
      }

      const targetUrl = resolveUrl(url);
      const currentRouteKey = getRouteKey(window.location.href);
      const targetRouteKey = getRouteKey(targetUrl.href);
      if (pushState && targetRouteKey === currentRouteKey) return;

      PageProgress.start();

      const currentPageId = PageRuntime.getPageIdFromUrl(window.location.href);
      const targetPageId = PageRuntime.getPageIdFromUrl(targetRouteKey);
      const currentToken = ++navigationToken;

      if (currentPageId === "blog" && targetPageId === "post") {
        rememberBlogReturnUrl(window.location.href);
      }

      activeNavigationController?.abort();
      activeNavigationController = new AbortController();

      PageRuntime.cleanupCurrentPage();

      content.style.pointerEvents = "none";
      content.style.transition = ROUTE_EXIT_TRANSITION;
      content.style.opacity = "0";
      content.style.transform = ROUTE_EXIT_TRANSFORM;
      const stuckFallbackTimer = setTimeout(() => {
        if (
          currentToken !== navigationToken ||
          content.style.pointerEvents !== "none" ||
          content.style.opacity !== "0"
        ) {
          return;
        }

        activeNavigationController?.abort();
        window.location.href = getNavigationFallbackUrl(targetRouteKey);
      }, getRouteStuckFallbackMs(targetRouteKey));

      try {
        const html = await fetchPageHtml(targetRouteKey, {
          signal: activeNavigationController.signal,
        });
        if (currentToken !== navigationToken) return;

        await waitForRouteExitCue();
        if (currentToken !== navigationToken) return;

        const doc = new DOMParser().parseFromString(html, "text/html");
        const newContent = doc.getElementById("spa-content");
        if (!newContent) {
          window.location.href = getNavigationFallbackUrl(targetRouteKey);
          return;
        }

        // /css/style.css is the global stylesheet already loaded on every
        // page; skip it by pathname so future filenames containing the
        // substring "style.css" (e.g. mobile-style.css) are still picked up.
        const extStylesheets = Array.from(
          doc.querySelectorAll('link[rel="stylesheet"][href]'),
        ).filter((link) => {
          const styleHref = link.getAttribute("href");
          if (!styleHref) return false;
          try {
            return new URL(styleHref, window.location.href).pathname !== "/css/style.css";
          } catch (error) {
            return false;
          }
        });
        await Promise.all(
          extStylesheets.map((link) => ensureStylesheet(link.getAttribute("href"))),
        );
        if (currentToken !== navigationToken) return;

        const pageLoader = window.PageLoaders?.[targetPageId];
        if (typeof pageLoader === "function") {
          try {
            await pageLoader();
          } catch (error) {
            if (currentToken !== navigationToken) return;
            console.error(`Failed to load page module for ${targetPageId}:`, error);
            window.location.href = getNavigationFallbackUrl(targetRouteKey);
            return;
          }
        }
        if (currentToken !== navigationToken) return;

        if (pushState) {
          history.pushState(null, "", targetUrl.href);
        }

        const nextTitle = doc.title || DEFAULT_OG_IMAGE_ALT;
        const nextDescription = doc.querySelector('meta[name="description"]')?.content || "";
        const nextOgTitle = doc.querySelector('meta[property="og:title"]')?.content || nextTitle;
        const nextOgDescription =
          doc.querySelector('meta[property="og:description"]')?.content || nextDescription;
        const nextOgImage =
          doc.querySelector('meta[property="og:image"]')?.content || DEFAULT_OG_IMAGE_URL;
        const nextOgImageAlt =
          doc.querySelector('meta[property="og:image:alt"]')?.content || nextTitle || DEFAULT_OG_IMAGE_ALT;
        const nextOgType = doc.querySelector('meta[property="og:type"]')?.content || "website";
        const nextRobots = doc.querySelector('meta[name="robots"]')?.content ?? null;
        const nextCanonicalUrl = doc.querySelector('link[rel="canonical"]')?.href || targetUrl.href;

        updateSeoMeta({
          title: nextTitle,
          description: nextDescription,
          url: targetUrl.href,
          canonicalUrl: nextCanonicalUrl,
          ogTitle: nextOgTitle,
          ogDescription: nextOgDescription,
          ogImage: nextOgImage,
          ogImageAlt: nextOgImageAlt,
          ogType: nextOgType,
          robots: nextRobots,
        });
        window.StructuredData?.syncFromDocument?.(doc);

        content.innerHTML = newContent.innerHTML;
        content.dataset.pendingFocus = targetPageId || "page";

        content.querySelectorAll(".page-transition-wrapper").forEach((element) => {
          element.style.animation = "none";
        });
        content.querySelectorAll(".top-actions").forEach((element) => {
          element.style.animation = "none";
          element.style.opacity = "1";
          element.style.transform = "none";
        });

        PageRuntime.initializePage(targetPageId);

        window.scrollTo({ top: 0, behavior: "auto" });
        window.requestAnimationFrame(() => {
          if (currentToken !== navigationToken) return;
          focusSpaContent({
            root: content,
            clearPendingFocus: targetPageId !== "post",
          });
        });

        content.style.opacity = "0";
        content.style.transform = ROUTE_ENTER_START_TRANSFORM;
        void content.offsetHeight;
        content.style.transition = ROUTE_ENTER_TRANSITION;
        content.style.opacity = "1";
        content.style.transform = ROUTE_ENTER_END_TRANSFORM;
        clearTimeout(stuckFallbackTimer);

        setTimeout(() => {
          if (currentToken !== navigationToken) return;
          content.style.transition = "";
          content.style.opacity = "";
          content.style.transform = "";
          content.style.pointerEvents = "";
        }, ROUTE_TRANSITION_RESET_MS);

        scheduleIdleNavWarm();
      } catch (error) {
        if (error?.name === "AbortError" || currentToken !== navigationToken) {
          return;
        }
        clearTimeout(stuckFallbackTimer);
        console.error("SPA navigation failed, falling back:", error);
        window.location.href = getNavigationFallbackUrl(targetRouteKey);
        return;
      } finally {
        if (currentToken === navigationToken) {
          activeNavigationController = null;
          PageProgress.finish();
        }
        clearTimeout(stuckFallbackTimer);
      }
    }

    document.addEventListener("click", (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest("a");
      if (!link || !link.href || link.target === "_blank" || link.hasAttribute("download")) return;

      const nextUrl = resolveUrl(link.href);
      const currentUrl = resolveUrl(window.location.href);
      if (nextUrl.origin !== currentUrl.origin) return;
      if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) {
        // Same page, same query — only hash differs (or is identical).
        // Let the browser handle same-page hash changes natively; page-level
        // listeners (e.g. hashchange in blog-page.js) will react accordingly.
        if (nextUrl.hash !== currentUrl.hash) return;
        if (nextUrl.hash) return;
      }

      event.preventDefault();
      navigate(nextUrl.href);
    });

    window.addEventListener("popstate", () => navigate(window.location.href, false));

    document.addEventListener(
      "pointerover",
      (event) => {
        if (event.pointerType === "touch" || !canWarmResources()) return;

        const target = event.target;
        if (!(target instanceof Element)) return;

        const link = target.closest("a");
        if (link && link.href && link.href.startsWith(window.location.origin)) {
          warmPage(link.href);
        }
      },
      {
        passive: true,
      },
    );

    document.addEventListener(
      "touchstart",
      (event) => {
        if (!canWarmResources()) return;

        const target = event.target;
        if (!(target instanceof Element)) return;

        const link = target.closest("a");
        if (link && link.href && link.href.startsWith(window.location.origin)) {
          warmPage(link.href);
        }
      },
      {
        passive: true,
        capture: true,
      },
    );

    document.addEventListener("focusin", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest("a");
      if (link && link.href && link.href.startsWith(window.location.origin)) {
        warmPage(link.href);
      }
    });

    const IDLE_WARM_SELECTOR = 'a[data-nav], a.btn-home, a.btn-primary, a.action-btn';
    const IDLE_WARM_MAX_LINKS = 4;

    function warmVisibleNavLinks() {
      if (!canWarmResources()) return;
      const origin = window.location.origin;
      const candidates = document.querySelectorAll(IDLE_WARM_SELECTOR);
      let warmed = 0;
      for (const link of candidates) {
        if (warmed >= IDLE_WARM_MAX_LINKS) break;
        if (!(link instanceof HTMLAnchorElement)) continue;
        if (!link.href || !link.href.startsWith(origin)) continue;
        warmPage(link.href);
        warmed += 1;
      }
    }

    function scheduleIdleNavWarm() {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(warmVisibleNavLinks, { timeout: 2000 });
      } else {
        window.setTimeout(warmVisibleNavLinks, 1500);
      }
    }

    history.replaceState(null, "", resolveUrl(window.location.href).href);

    if (document.readyState === "complete") {
      scheduleIdleNavWarm();
    } else {
      window.addEventListener("load", scheduleIdleNavWarm, { once: true });
    }

    return { navigate, warmPage, scheduleIdleNavWarm };
  })();

  window.SPARouter = SPARouter;
})();
