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
  const ROUTE_NETWORK_TIMEOUT_MS = 15000;
  const ROUTE_PREPARE_TIMEOUT_MS = 10000;

  const SPARouter = (() => {
    let navigationToken = 0;
    let activeNavigationController = null;
    const loadedStylesheets = new Set();
    const pendingStylesheets = new Map();
    const loadedModulePreloads = new Set();
    const hardNavigationTargets = new Set();
    const MAX_PAGE_CACHE_ENTRIES = 6;
    const MAX_PAGE_CACHE_BYTES = 2 * 1024 * 1024;
    const MAX_PER_ENTRY_CACHE_BYTES = 1 * 1024 * 1024;
    const MAX_PENDING_PAGE_FETCHES = 4;
    const PAGE_CACHE_TTL_MS = 1000 * 60 * 5;
    const pageCache = new Map();
    let pageCacheTotalBytes = 0;
    const prefetched = new Map();
    const pendingPageFetches = new Map();
    let activePageUrl = normalizeSiteUrl(window.location.href).href;

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

    function isSameOriginUrl(url) {
      try {
        return normalizeSiteUrl(url).origin === window.location.origin;
      } catch (error) {
        return false;
      }
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

    function getRouteRequestUrl(url) {
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

    async function requestPageHtml(url, { signal, cacheMode = "no-store" } = {}) {
      const response = await fetch(url, {
        cache: cacheMode,
        signal,
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        error.url = url;
        throw error;
      }

      return response.text();
    }

    async function requestRouteHtml(routeKey, { signal, cacheMode = "no-store" } = {}) {
      const fallbackUrl = buildPostTemplateFallbackUrl(routeKey);
      if (fallbackUrl && shouldUsePostTemplateFallbackFirst(routeKey)) {
        return requestPageHtml(fallbackUrl, { signal, cacheMode });
      }

      try {
        return await requestPageHtml(routeKey, { signal, cacheMode });
      } catch (error) {
        if (error?.status !== 404 || !fallbackUrl) throw error;

        return requestPageHtml(fallbackUrl, {
          signal,
          cacheMode,
        });
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
      if (loadedStylesheets.has(resolvedHref)) {
        return Promise.resolve();
      }

      const pendingStylesheet = pendingStylesheets.get(resolvedHref);
      if (pendingStylesheet) {
        return pendingStylesheet;
      }

      const existingLink = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(
        (link) => link.href === resolvedHref,
      );
      if (existingLink) {
        loadedStylesheets.add(resolvedHref);
        return Promise.resolve();
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = resolvedHref;
      const stylesheetPromise = new Promise((resolve, reject) => {
        link.onload = () => {
          pendingStylesheets.delete(resolvedHref);
          loadedStylesheets.add(resolvedHref);
          resolve();
        };
        link.onerror = () => {
          pendingStylesheets.delete(resolvedHref);
          loadedStylesheets.delete(resolvedHref);
          link.remove();
          reject(new Error(`Failed to load stylesheet: ${resolvedHref}`));
        };
      });
      pendingStylesheets.set(resolvedHref, stylesheetPromise);
      try {
        document.head.appendChild(link);
      } catch (error) {
        pendingStylesheets.delete(resolvedHref);
        return Promise.reject(error);
      }
      return stylesheetPromise;
    }

    function readDocumentAssetVersion(doc) {
      const runtimeScript = doc?.querySelector?.('script[data-spa-runtime][src]');
      const runtimeSrc = runtimeScript?.getAttribute?.("src");
      if (!runtimeSrc) return "";

      try {
        return new URL(runtimeSrc, window.location.href).searchParams.get("v") || "";
      } catch (error) {
        return "";
      }
    }

    function hasDocumentAssetVersionMismatch(doc) {
      const currentVersion = typeof window.AppAssetVersion === "string"
        ? window.AppAssetVersion.trim()
        : "";
      const documentVersion = readDocumentAssetVersion(doc);
      // A fetched page without the runtime marker is not a trustworthy SPA
      // transaction input. Fail closed and let a direct navigation load that
      // document in its own asset/runtime context.
      return !currentVersion || !documentVersion || currentVersion !== documentVersion;
    }

    function ensureModulePreload(sourceLink) {
      const rawHref = sourceLink?.getAttribute?.("href");
      if (!rawHref) return false;

      let resolvedHref;
      try {
        resolvedHref = resolveUrl(rawHref).href;
      } catch (error) {
        return false;
      }
      if (new URL(resolvedHref).origin !== window.location.origin) return false;

      const existingLink = Array.from(
        document.querySelectorAll('link[rel="modulepreload"][href]'),
      ).find((link) => link.href === resolvedHref);
      if (loadedModulePreloads.has(resolvedHref) || existingLink) {
        loadedModulePreloads.add(resolvedHref);
        return false;
      }

      const link = document.createElement("link");
      link.rel = "modulepreload";
      link.href = resolvedHref;
      ["crossorigin", "fetchpriority", "integrity", "referrerpolicy"].forEach((attribute) => {
        const value = sourceLink.getAttribute?.(attribute);
        if (value != null) link.setAttribute(attribute, value);
      });
      loadedModulePreloads.add(resolvedHref);
      document.head.appendChild(link);
      return true;
    }

    function preloadDocumentModules(doc) {
      Array.from(doc?.querySelectorAll?.('link[rel="modulepreload"][href]') || [])
        .forEach(ensureModulePreload);
    }

    function syncCurrentUrl(url = window.location.href) {
      activePageUrl = resolveUrl(url).href;
      return activePageUrl;
    }

    function isHashOnlyHistoryChange(previousUrl, nextUrl) {
      const previous = resolveUrl(previousUrl);
      const next = resolveUrl(nextUrl);
      return (
        previous.origin === next.origin
        && previous.pathname === next.pathname
        && previous.search === next.search
        && previous.hash !== next.hash
      );
    }

    function hardNavigateOnce(url, { replace = false } = {}) {
      const targetHref = resolveUrl(url).href;
      if (hardNavigationTargets.has(targetHref)) return false;

      hardNavigationTargets.add(targetHref);
      try {
        if (replace && typeof window.location.replace === "function") {
          window.location.replace(targetHref);
        } else if (typeof window.location.assign === "function") {
          window.location.assign(targetHref);
        } else {
          window.location.href = targetHref;
        }
      } catch (error) {
        hardNavigationTargets.delete(targetHref);
        throw error;
      }
      return true;
    }

    function showNavigationRetry({ targetUrl, pushState }) {
      window.NavigationFeedback?.show?.({
        message: "页面暂时无法打开，请检查网络后重试。",
        actionLabel: "重试",
        onAction: () => navigate(targetUrl, pushState),
      });
    }

    function showHardNavigationRetry(targetUrl, { replace = false } = {}) {
      const targetHref = resolveUrl(targetUrl).href;
      window.NavigationFeedback?.show?.({
        message: "页面资源已更新，正在打开最新版本。若未跳转，请重试。",
        actionLabel: "打开页面",
        onAction: () => {
          hardNavigationTargets.delete(targetHref);
          hardNavigateOnce(targetHref, { replace });
        },
      });
    }

    async function fetchPageHtml(url, { signal, cacheMode = "no-store" } = {}) {
      if (signal?.aborted) {
        throw signal.reason || createNavigationAbortError();
      }

      const routeKey = getRouteKey(url);
      const requestUrl = getRouteRequestUrl(routeKey);
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
        const pendingEntry = pendingPageFetches.get(cacheKey);
        if (pendingEntry) {
          return consumePendingPageFetch(pendingEntry, signal);
        }
      }

      if (canCacheHtml) {
        const pendingEntry = createPendingPageFetch(requestUrl, cacheKey, cacheMode);
        return consumePendingPageFetch(pendingEntry, signal);
      }

      return requestRouteHtml(requestUrl, {
        signal,
        cacheMode,
      });
    }

    function warmPage(url) {
      if (!canWarmResources() || !isSameOriginUrl(url)) return false;
      const routeKey = getRouteKey(url);
      const pageId = PageRuntime.getPageIdFromUrl(routeKey);
      if (!pageId || !isRouteHtmlCacheable(routeKey)) return false;

      const cacheKey = getPageCacheKey(routeKey);
      if (cacheKey === getPageCacheKey(activePageUrl)) return false;
      if (hasFreshPrefetch(cacheKey) || readPageHtmlFromCache(cacheKey)) return false;
      if (pendingPageFetches.size >= MAX_PENDING_PAGE_FETCHES) return false;

      rememberPrefetchedPage(cacheKey);
      fetchPageHtml(routeKey, { cacheMode: "default" }).catch(() => {
        prefetched.delete(cacheKey);
      });
      return true;
    }

    function waitForRouteExitCue() {
      return new Promise((resolve) => setTimeout(resolve, ROUTE_EXIT_CUE_MS));
    }

    function createNavigationTimeout(message) {
      const error = new Error(message);
      error.name = "NavigationTimeoutError";
      return error;
    }

    function createNavigationAbortError() {
      const error = new Error("SPA navigation request was aborted");
      error.name = "AbortError";
      return error;
    }

    function waitForTaskWithSignal(task, signal) {
      if (!signal) return Promise.resolve(task);
      if (signal.aborted) {
        Promise.resolve(task).catch(() => {});
        return Promise.reject(signal.reason || createNavigationAbortError());
      }

      return new Promise((resolve, reject) => {
        let didSettle = false;
        const settle = (handler, value) => {
          if (didSettle) return;
          didSettle = true;
          signal.removeEventListener?.("abort", handleAbort);
          handler(value);
        };
        const handleAbort = () => settle(
          reject,
          signal.reason || createNavigationAbortError(),
        );

        signal.addEventListener?.("abort", handleAbort, { once: true });
        Promise.resolve(task).then(
          (value) => settle(resolve, value),
          (error) => settle(reject, error),
        );
      });
    }

    function consumePendingPageFetch(entry, signal) {
      if (signal?.aborted) {
        if (entry.consumers === 0 && !entry.didSettle) {
          entry.controller.abort(signal.reason || createNavigationAbortError());
        }
        entry.promise.catch(() => {});
        return Promise.reject(signal.reason || createNavigationAbortError());
      }

      entry.consumers += 1;
      return new Promise((resolve, reject) => {
        let didSettle = false;
        const settle = (handler, value, wasAborted = false) => {
          if (didSettle) return;
          didSettle = true;
          signal?.removeEventListener?.("abort", handleAbort);
          entry.consumers = Math.max(0, entry.consumers - 1);
          if (wasAborted && entry.consumers === 0 && !entry.didSettle) {
            entry.controller.abort(signal?.reason || createNavigationAbortError());
          }
          handler(value);
        };
        const handleAbort = () => settle(
          reject,
          signal?.reason || createNavigationAbortError(),
          true,
        );

        signal?.addEventListener?.("abort", handleAbort, { once: true });
        entry.promise.then(
          (value) => settle(resolve, value),
          (error) => settle(reject, error),
        );
      });
    }

    function createPendingPageFetch(routeKey, cacheKey, cacheMode) {
      const controller = new AbortController();
      const entry = {
        controller,
        consumers: 0,
        didSettle: false,
        promise: null,
      };
      const timeoutId = window.setTimeout(() => {
        controller.abort(createNavigationTimeout("SPA page fetch timed out"));
      }, ROUTE_NETWORK_TIMEOUT_MS);
      const request = requestRouteHtml(routeKey, {
        signal: controller.signal,
        cacheMode,
      });

      entry.promise = waitForTaskWithSignal(request, controller.signal)
        .then((html) => {
          rememberPageHtml(cacheKey, html);
          return html;
        })
        .finally(() => {
          entry.didSettle = true;
          window.clearTimeout(timeoutId);
          if (pendingPageFetches.get(cacheKey) === entry) {
            pendingPageFetches.delete(cacheKey);
          }
        });
      pendingPageFetches.set(cacheKey, entry);
      return entry;
    }

    function withDeadline(task, timeoutMs, onTimeout, message) {
      let timeoutId = null;
      const timeout = new Promise((resolve, reject) => {
        timeoutId = window.setTimeout(() => {
          onTimeout?.();
          reject(createNavigationTimeout(message));
        }, timeoutMs);
      });

      return Promise.race([Promise.resolve(task), timeout]).finally(() => {
        window.clearTimeout(timeoutId);
      });
    }

    function restoreCurrentPage(content, currentToken) {
      if (currentToken !== navigationToken) return;
      content.style.transition = ROUTE_ENTER_TRANSITION;
      content.style.opacity = "1";
      content.style.transform = ROUTE_ENTER_END_TRANSFORM;
      content.style.pointerEvents = "";

      window.setTimeout(() => {
        if (currentToken !== navigationToken) return;
        content.style.transition = "";
        content.style.opacity = "";
        content.style.transform = "";
      }, ROUTE_TRANSITION_RESET_MS);
    }

    async function navigate(url, pushState = true) {
      const content = document.getElementById("spa-content");
      if (!content) {
        window.location.href = url;
        return;
      }

      const targetUrl = resolveUrl(url);
      const currentRouteKey = getRouteKey(activePageUrl);
      const targetRouteKey = getRouteKey(targetUrl.href);
      if (pushState && targetRouteKey === currentRouteKey) return;

      window.NavigationFeedback?.clear?.();
      PageProgress.start();

      const currentPageId = PageRuntime.getPageIdFromUrl(activePageUrl);
      const targetPageId = PageRuntime.getPageIdFromUrl(targetRouteKey);
      const currentToken = ++navigationToken;
      const previousPageUrl = activePageUrl;
      const previousPageMarkup = content.innerHTML;
      const hadPendingFocus = Object.prototype.hasOwnProperty.call(content.dataset, "pendingFocus");
      const previousPendingFocus = content.dataset.pendingFocus;
      let pageSwapPendingCommit = false;
      let didPushHistoryEntry = false;

      function rollbackPageSwap() {
        if (!pageSwapPendingCommit || currentToken !== navigationToken) return;

        PageRuntime.cleanupCurrentPage();
        content.innerHTML = previousPageMarkup;
        if (hadPendingFocus) {
          content.dataset.pendingFocus = previousPendingFocus;
        } else {
          delete content.dataset.pendingFocus;
        }
        if (window.location.href !== previousPageUrl) {
          history.replaceState(null, "", previousPageUrl);
        }
        activePageUrl = previousPageUrl;
        pageSwapPendingCommit = false;

        try {
          PageRuntime.initializePage(currentPageId);
        } catch (rollbackError) {
          console.error("Failed to restore the previous page runtime:", rollbackError);
        }
      }

      if (currentPageId === "blog" && targetPageId === "post") {
        rememberBlogReturnUrl(window.location.href);
      }

      activeNavigationController?.abort();
      const navigationController = new AbortController();
      activeNavigationController = navigationController;

      content.style.pointerEvents = "none";
      content.style.transition = ROUTE_EXIT_TRANSITION;
      content.style.opacity = "0";
      content.style.transform = ROUTE_EXIT_TRANSFORM;
      let navigationStage = "network";
      try {
        const html = await withDeadline(
          fetchPageHtml(targetRouteKey, {
            signal: navigationController.signal,
          }),
          ROUTE_NETWORK_TIMEOUT_MS,
          () => navigationController.abort(),
          "SPA navigation network request timed out",
        );
        if (currentToken !== navigationToken) return;
        navigationStage = "prepare";

        const preparedPage = await withDeadline(
          (async () => {
            await waitForRouteExitCue();
            if (currentToken !== navigationToken) return null;

            const doc = new DOMParser().parseFromString(html, "text/html");
            const newContent = doc.getElementById("spa-content");
            if (!newContent) {
              throw new Error("SPA response did not contain #spa-content");
            }

            if (hasDocumentAssetVersionMismatch(doc)) {
              restoreCurrentPage(content, currentToken);
              showHardNavigationRetry(targetUrl.href);
              hardNavigateOnce(targetUrl.href);
              return null;
            }

            // The fetched page is parsed in a detached document, so its
            // modulepreloads are otherwise ignored. Adopt them before waiting
            // on CSS and the sequential UMD-compatible page loader chain.
            preloadDocumentModules(doc);

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
            if (currentToken !== navigationToken) return null;

            const pageLoader = window.PageLoaders?.[targetPageId];
            if (typeof pageLoader === "function") {
              await pageLoader({
                url: targetUrl.href,
                signal: navigationController.signal,
              });
            }

            return { doc, newContent };
          })(),
          ROUTE_PREPARE_TIMEOUT_MS,
          () => navigationController.abort(),
          "SPA navigation page preparation timed out",
        );
        if (!preparedPage || currentToken !== navigationToken) return;
        const { doc, newContent } = preparedPage;
        if (currentToken !== navigationToken) return;

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

        if (pushState) {
          history.pushState(null, "", targetUrl.href);
          didPushHistoryEntry = true;
        }
        PageRuntime.cleanupCurrentPage();
        content.innerHTML = newContent.innerHTML;
        content.dataset.pendingFocus = targetPageId || "page";
        pageSwapPendingCommit = true;

        content.querySelectorAll(".page-transition-wrapper").forEach((element) => {
          element.style.animation = "none";
        });
        content.querySelectorAll(".top-actions").forEach((element) => {
          element.style.animation = "none";
          element.style.opacity = "1";
          element.style.transform = "none";
        });

        PageRuntime.initializePage(targetPageId);
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
        activePageUrl = targetUrl.href;
        pageSwapPendingCommit = false;
        window.NavigationFeedback?.clear?.();

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
        setTimeout(() => {
          if (currentToken !== navigationToken) return;
          content.style.transition = "";
          content.style.opacity = "";
          content.style.transform = "";
          content.style.pointerEvents = "";
        }, ROUTE_TRANSITION_RESET_MS);

        scheduleIdleNavWarm();
      } catch (error) {
        if (currentToken !== navigationToken) {
          return;
        }
        navigationController.abort();
        if (error?.name !== "AbortError") {
          console.error("SPA navigation failed; keeping the current page interactive:", error);
        }
        const shouldReplaceFailedHistoryEntry = pageSwapPendingCommit && didPushHistoryEntry;
        rollbackPageSwap();
        if (!pushState && window.location.href !== activePageUrl) {
          history.replaceState(null, "", activePageUrl);
        }
        restoreCurrentPage(content, currentToken);

        if (navigationStage === "prepare") {
          showHardNavigationRetry(targetUrl.href, {
            replace: shouldReplaceFailedHistoryEntry,
          });
          try {
            hardNavigateOnce(targetUrl.href, {
              replace: shouldReplaceFailedHistoryEntry,
            });
          } catch (hardNavigationError) {
            console.error("Hard navigation fallback failed:", hardNavigationError);
          }
        } else {
          const retryShouldPushState = pushState || window.location.href !== targetUrl.href;
          showNavigationRetry({
            targetUrl: targetUrl.href,
            pushState: retryShouldPushState,
          });
        }
        return;
      } finally {
        if (currentToken === navigationToken) {
          if (activeNavigationController === navigationController) {
            activeNavigationController = null;
          }
          PageProgress.finish();
        }
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
      if (!PageRuntime.getPageIdFromUrl(nextUrl.href)) return;
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

    window.addEventListener("popstate", () => {
      const targetHref = resolveUrl(window.location.href).href;
      if (isHashOnlyHistoryChange(activePageUrl, targetHref)) {
        syncCurrentUrl(targetHref);
        return;
      }

      navigate(targetHref, false);
    });
    window.addEventListener("hashchange", () => {
      syncCurrentUrl(window.location.href);
    });

    document.addEventListener(
      "pointerover",
      (event) => {
        if (event.pointerType === "touch" || !canWarmResources()) return;

        const target = event.target;
        if (!(target instanceof Element)) return;

        const link = target.closest("a");
        if (link && link.href && isSameOriginUrl(link.href)) {
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
        if (link && link.href && isSameOriginUrl(link.href)) {
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
      if (link && link.href && isSameOriginUrl(link.href)) {
        warmPage(link.href);
      }
    });

    const IDLE_WARM_SELECTOR = 'a[data-nav], a.btn-home, a.btn-primary, a.action-btn';
    const IDLE_WARM_MAX_LINKS = 4;

    function warmVisibleNavLinks() {
      if (!canWarmResources()) return;
      const candidates = document.querySelectorAll(IDLE_WARM_SELECTOR);
      let warmed = 0;
      for (const link of candidates) {
        if (warmed >= IDLE_WARM_MAX_LINKS) break;
        if (!(link instanceof HTMLAnchorElement)) continue;
        if (!link.href || !isSameOriginUrl(link.href)) continue;
        if (warmPage(link.href)) warmed += 1;
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

    return { navigate, warmPage, scheduleIdleNavWarm, syncCurrentUrl };
  })();

  window.SPARouter = SPARouter;
})();
