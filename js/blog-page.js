(() => {
  const SHARED_CONTENT = window.NotionContent;
  const ALL_CATEGORY = SHARED_CONTENT.ALL_CATEGORY;
  const BOOKMARK_CATEGORY = SHARED_CONTENT.BOOKMARK_CATEGORY;
  const DEFAULT_PAGE_SIZE = 9;
  const EAGER_COVER_IMAGE_COUNT = 3;
  const MOBILE_EAGER_COVER_IMAGE_COUNT = 1;
  const PAGINATION_SIBLING_COUNT = 2;
  const PAGINATION_MAX_NUMBERED_BUTTONS = (PAGINATION_SIBLING_COUNT * 2) + 3;
  const DEFAULT_SUPPORTED_CATEGORIES = Object.freeze(SHARED_CONTENT.getSupportedBlogCategories());
  const BOOKMARK_ONLY_CATEGORIES = Object.freeze(SHARED_CONTENT.getBookmarkOnlyCategories());
  const FALLBACK_CATEGORY_COLOR = SHARED_CONTENT.DEFAULT_CATEGORY_COLOR;
  const DEFAULT_COVER_GRADIENT = SHARED_CONTENT.DEFAULT_COVER_GRADIENT;
  const sanitizeCssColor = SHARED_CONTENT.sanitizeCssColorValue;
  const normalizeBookmarkSearchQuery = SHARED_CONTENT.normalizeSearchText;
  const buildSharedPostSearchText = SHARED_CONTENT.buildPostSearchText;
  const HISTORY_MODE_REPLACE = "replace";
  const HISTORY_MODE_PUSH = "push";
  const PRELOAD_COVER_IMAGE_COUNT = 3;
  const MOBILE_PRELOAD_COVER_IMAGE_COUNT = 1;

  function buildBookmarkSearchText(post) {
    return buildSharedPostSearchText(post);
  }

  function buildBookmarkPageData({ bookmarkManager, search, page, pageSize, onBeforeRead } = {}) {
    if (typeof onBeforeRead === "function") {
      onBeforeRead();
    }

    let bookmarks = bookmarkManager.getAll();
    if (search) {
      const query = normalizeBookmarkSearchQuery(search);
      bookmarks = bookmarks.filter((post) => buildBookmarkSearchText(post).includes(query));
    }

    const total = bookmarks.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const start = (currentPage - 1) * pageSize;

    return {
      results: bookmarks.slice(start, start + pageSize),
      total,
      totalPages,
      currentPage,
    };
  }

  function initBlogPage() {
    const notionApi = window.NotionAPI;
    const sharedContent = SHARED_CONTENT;
    const siteUtils = window.SiteUtils || {};
    const parseBookmarkListingHash = siteUtils.parseBookmarkListingHash;
    const buildBookmarkListingUrl = siteUtils.buildBookmarkListingUrl;
    const bookmarkManager = window.BookmarkManager || {
      getAll: () => [],
      isBookmarked: () => false,
      toggleById: () => null,
    };
    const mobileDeviceQuery =
      typeof siteUtils.createMobileDeviceQueryList === "function"
        ? siteUtils.createMobileDeviceQueryList()
        : typeof siteUtils.createMediaQueryList === "function"
          ? siteUtils.createMediaQueryList("(max-width: 768px) and (hover: none) and (pointer: coarse)")
          : window.matchMedia?.("(max-width: 768px) and (hover: none) and (pointer: coarse)") || { matches: false };
    function isMobileDeviceViewport() {
      return typeof siteUtils.isMobileDeviceViewport === "function"
        ? siteUtils.isMobileDeviceViewport()
        : mobileDeviceQuery.matches;
    }

    const hasRemoteSource = Boolean(notionApi);
    const defaultCategory = hasRemoteSource ? ALL_CATEGORY : BOOKMARK_CATEGORY;

    const filtersEl = document.getElementById("blogFilters");
    const searchInput = document.getElementById("blogSearch");
    const gridEl = document.getElementById("blogGrid");
    const emptyEl = document.getElementById("emptyState");
    const paginationEl = document.getElementById("pagination");
    const statusEl = document.getElementById("blogStatus");
    const topActionsEl = document.getElementById("topActions");
    const escapeText = notionApi?.escapeHtml || sharedContent.escapeHtml;
    const getCategoryColor =
      notionApi?.getCategoryColor ||
      sharedContent.getCategoryColor ||
      (() => FALLBACK_CATEGORY_COLOR);

    if (!filtersEl || !searchInput || !gridEl || !emptyEl || !paginationEl) {
      return null;
    }

    let currentCategory = defaultCategory;
    let currentSearch = "";
    let currentPage = 1;
    let renderToken = 0;
    let searchDebounce = null;
    let revealFrame = null;
    let cleanupCardReveal = null;
    let statusAnnouncementHandle = null;
    let metadataHydrationTask = null;
    let didAttemptHydration = false;
    let didCompleteInitialRender = false;
    let isDisposed = false;
    let didNormalizeRoute = false;
    let hashChangeHandler = null;
    const preloadedCoverImages = new Set();
    const preloadedCoverLinks = new Set();
    let categories = hasRemoteSource ? notionApi.getCategories() : BOOKMARK_ONLY_CATEGORIES;
    let validCategories = new Set([...categories.map((cat) => cat.name), BOOKMARK_CATEGORY]);

    const params = new URLSearchParams(window.location.search);
    const rawCategory = params.get("category");
    const rawSearch = params.get("search");
    const rawPage = params.get("page");
    const bookmarkHashState = parseBookmarkListingHash(window.location.hash);

    if (rawCategory) {
      currentCategory = rawCategory.trim();
      if (currentCategory !== rawCategory) {
        didNormalizeRoute = true;
      }
    }
    if (rawSearch) {
      currentSearch = rawSearch.trim();
      if (currentSearch !== rawSearch) {
        didNormalizeRoute = true;
      }
    }
    if (rawPage) {
      currentPage = Math.max(1, parseInt(rawPage, 10) || 1);
      if (String(currentPage) !== rawPage) {
        didNormalizeRoute = true;
      }
    }
    if (bookmarkHashState.active) {
      currentCategory = BOOKMARK_CATEGORY;
      currentSearch = bookmarkHashState.search;
      currentPage = bookmarkHashState.page;
      if (
        rawCategory ||
        rawSearch ||
        rawPage ||
        (window.location.hash || "") !== bookmarkHashState.normalizedHash
      ) {
        didNormalizeRoute = true;
      }
    } else if (currentCategory === BOOKMARK_CATEGORY) {
      didNormalizeRoute = true;
    }
    if (!hasRemoteSource && !validCategories.has(currentCategory)) {
      currentCategory = defaultCategory;
      didNormalizeRoute = true;
    }

    if (!hasRemoteSource && currentCategory !== BOOKMARK_CATEGORY) {
      console.error("NotionAPI is unavailable on blog page.");
      if (didNormalizeRoute) {
        syncListingUrl();
      }
      searchInput.value = currentSearch;
      updatePageUI();
      if (typeof siteUtils.rememberBlogReturnUrl === "function") {
        siteUtils.rememberBlogReturnUrl(window.location.href);
      }
      filtersEl.replaceChildren();
      showEmptyState({
        title: "加载失败",
        hint: currentSearch
          ? `搜索“${currentSearch}”的文章数据暂时不可用，请稍后重试。`
          : "文章数据暂时不可用，请稍后重试。",
        announcement: currentSearch
          ? `搜索“${currentSearch}”的文章数据暂时不可用。`
          : "文章数据暂时不可用。",
      });
      return null;
    }

    const pageSize = notionApi?.getPageSize?.() || DEFAULT_PAGE_SIZE;
    searchInput.setAttribute("aria-controls", "blogGrid");

    function clearCardReveal() {
      if (revealFrame != null) {
        window.cancelAnimationFrame(revealFrame);
        revealFrame = null;
      }

      if (typeof cleanupCardReveal === "function") {
        cleanupCardReveal();
      }
      cleanupCardReveal = null;
    }

    function clearStatusAnnouncement() {
      if (statusAnnouncementHandle == null) return;
      clearTimeout(statusAnnouncementHandle);
      statusAnnouncementHandle = null;
    }

    function announceStatus(message) {
      if (!statusEl || typeof message !== "string" || !message.trim()) return;

      clearStatusAnnouncement();
      statusEl.textContent = "";
      statusAnnouncementHandle = window.setTimeout(() => {
        statusEl.textContent = message;
        statusAnnouncementHandle = null;
      }, 30);
    }

    function setGridBusy(isBusy) {
      gridEl.setAttribute("aria-busy", isBusy ? "true" : "false");
    }

    function describeLoadFailure(error) {
      const status = Number(error?.status);
      const code = typeof error?.code === "string" ? error.code : "";
      const notionCode = typeof error?.notionCode === "string" ? error.notionCode : "";
      const detail = typeof error?.detail === "string"
        ? error.detail.trim()
        : typeof error?.message === "string"
          ? error.message.trim()
          : "";
      const normalizedDetail = detail.toLowerCase();
      const isDatabaseObjectNotFound =
        notionCode === "object_not_found" && normalizedDetail.includes("database");

      if (code === "notion_config_error") {
        if (detail.includes("NOTION_DATABASE_ID")) {
          return "文章数据库 ID 未配置，请检查 Vercel 环境变量。";
        }
        if (detail.includes("NOTION_TOKEN")) {
          return "Notion Token 未配置，请检查 Vercel 环境变量。";
        }
        return "站点的 Notion 环境变量配置不完整。";
      }

      if (code === "notion_public_config_error") {
        return "当前部署仍在返回旧版公开字段错误，请确认线上已部署 v2.7，并检查 Vercel 的 Notion 环境变量。";
      }

      if (status === 401 || status === 403 || notionCode === "unauthorized" || notionCode === "restricted_resource") {
        return "Notion integration 暂无数据库访问权限，请确认已把集成邀请到该数据库。";
      }

      if (
        (status === 404 || isDatabaseObjectNotFound) &&
        (normalizedDetail.includes("database") || notionCode === "object_not_found")
      ) {
        return "NOTION_DATABASE_ID 无效，或当前 integration 无权访问这个数据库。";
      }

      if (status === 429 || notionCode === "rate_limited") {
        return "Notion API 当前限流，请稍后重试。";
      }

      if (status === 504 || code === "notion_timeout_error") {
        return "Notion API 响应超时，请稍后重试。";
      }

      return "请检查网络后重试";
    }

    function isBookmarkView() {
      return currentCategory === BOOKMARK_CATEGORY;
    }

    function normalizeListingPage(value, fallback = 1) {
      const parsed = Number.parseInt(String(value ?? ""), 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    function isSameBlogListingPath(url) {
      try {
        const targetUrl = new URL(url, window.location.href);
        const currentUrl = new URL(window.location.href);
        return (
          targetUrl.origin === currentUrl.origin &&
          targetUrl.pathname === currentUrl.pathname
        );
      } catch (error) {
        return false;
      }
    }

    function readListingStateFromUrl(url) {
      const targetUrl = new URL(url, window.location.href);
      const bookmarkState = parseBookmarkListingHash(targetUrl.hash);

      if (bookmarkState.active) {
        return {
          category: BOOKMARK_CATEGORY,
          search: bookmarkState.search,
          page: bookmarkState.page,
        };
      }

      if (targetUrl.hash) {
        return null;
      }

      return {
        category: (targetUrl.searchParams.get("category") || ALL_CATEGORY).trim(),
        search: (targetUrl.searchParams.get("search") || "").trim(),
        page: normalizeListingPage(targetUrl.searchParams.get("page"), 1),
      };
    }

    function applyListingState({ category, search = "", page = 1 } = {}, historyMode = HISTORY_MODE_PUSH) {
      const rawCategory = typeof category === "string" && category.trim() ? category.trim() : defaultCategory;
      const nextCategory = hasRemoteSource || validCategories.has(rawCategory) ? rawCategory : defaultCategory;
      const nextSearch = typeof search === "string" ? search.trim() : "";
      const nextPage = normalizeListingPage(page, 1);
      const didChange =
        currentCategory !== nextCategory ||
        currentSearch !== nextSearch ||
        currentPage !== nextPage;

      currentCategory = nextCategory;
      currentSearch = nextSearch;
      currentPage = nextPage;
      searchInput.value = currentSearch;
      syncListingUrl(historyMode);

      if (!didChange) {
        updatePageUI();
        renderFilters();
        return false;
      }

      updatePageUI();
      renderFilters();
      renderPosts();
      window.scrollTo({ top: 0, behavior: "auto" });
      return true;
    }

    function scheduleLegacyMetadataHydration() {
      if (!isBookmarkView()) return;
      if (didAttemptHydration) return;
      if (metadataHydrationTask) return;
      if (typeof bookmarkManager.hasLegacyMetadata !== "function") return;
      if (!bookmarkManager.hasLegacyMetadata()) return;

      didAttemptHydration = true;
      metadataHydrationTask = Promise.resolve(bookmarkManager.hydrateMissingMetadata?.())
        .then((didHydrate) => {
          if (didHydrate && !isDisposed && isBookmarkView()) {
            renderPosts();
          }
        })
        .catch(() => {})
        .finally(() => {
          metadataHydrationTask = null;
        });
    }

    function buildResultsAnnouncement(data) {
      const total = Number(data?.total) || 0;
      const currentPageValue = Number(data?.currentPage) || 1;
      const totalPagesValue = Number(data?.totalPages) || 1;

      if (total === 0) {
        return currentSearch
          ? `没有找到与“${currentSearch}”匹配的文章。`
          : "当前没有可显示的文章。";
      }

      if (currentSearch) {
        return `搜索结果已更新，共 ${total} 篇文章，当前第 ${currentPageValue} 页，共 ${totalPagesValue} 页。`;
      }

      return `文章列表已更新，共 ${total} 篇文章，当前第 ${currentPageValue} 页，共 ${totalPagesValue} 页。`;
    }

    function renderEmptyStateMarkup({
      title = "没有找到匹配的文章",
      hint = "试试其他关键词或分类",
      actionLabel = "",
    } = {}) {
      const actionHtml = actionLabel
        ? `<button type="button" class="empty-state-action" data-empty-action="retry">${escapeText(actionLabel)}</button>`
        : "";

      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <p>${escapeText(title)}</p>
        <p style="font-size: 0.85rem;">${escapeText(hint)}</p>
        ${actionHtml}
      `;
    }

    function resolveSafeCoverImage(post) {
      return typeof siteUtils.resolveProxiedDisplayImageUrl === "function"
        ? siteUtils.resolveProxiedDisplayImageUrl(post?.coverImage)
        : typeof siteUtils.resolveDisplayImageUrl === "function"
          ? siteUtils.resolveDisplayImageUrl(post?.coverImage)
        : typeof siteUtils.sanitizeImageUrl === "function"
          ? siteUtils.sanitizeImageUrl(post?.coverImage)
          : null;
    }

    function preloadCoverImages(posts = []) {
      cleanupPreloadedCoverLinks();
      if (!Array.isArray(posts) || posts.length === 0) return;

      const preloadCount = isMobileDeviceViewport()
        ? MOBILE_PRELOAD_COVER_IMAGE_COUNT
        : PRELOAD_COVER_IMAGE_COUNT;

      posts.slice(0, preloadCount).forEach((post) => {
        const coverImage = resolveSafeCoverImage(post);
        if (!coverImage || preloadedCoverImages.has(coverImage)) return;

        preloadedCoverImages.add(coverImage);
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "image";
        link.href = coverImage;
        link.fetchPriority = "high";
        link.setAttribute("fetchpriority", "high");
        link.dataset.blogCoverPreload = "true";
        link.setAttribute("data-blog-cover-preload", "true");
        preloadedCoverLinks.add(link);
        document.head?.appendChild(link);
      });
    }

    function cleanupPreloadedCoverLinks() {
      const links = new Set(preloadedCoverLinks);
      document.head?.querySelectorAll?.('link[data-blog-cover-preload="true"]').forEach((link) => {
        links.add(link);
      });

      links.forEach((link) => {
        link.remove?.();
      });
      preloadedCoverLinks.clear();
      preloadedCoverImages.clear();
    }

    function showEmptyState(options = {}) {
      clearCardReveal();
      cleanupPreloadedCoverLinks();
      setGridBusy(false);
      gridEl.innerHTML = "";
      emptyEl.innerHTML = renderEmptyStateMarkup(options);
      emptyEl.style.display = "flex";
      paginationEl.innerHTML = "";
      announceStatus(options.announcement || options.title || "没有找到匹配的文章。");
    }

    function revealRenderedCards() {
      const shouldAnimateCards = !didCompleteInitialRender && !isMobileDeviceViewport();
      didCompleteInitialRender = true;

      if (!shouldAnimateCards) {
        gridEl.querySelectorAll(".blog-card").forEach((card) => {
          card.classList.add("visible");
        });
        return;
      }

      revealFrame = window.requestAnimationFrame(() => {
        revealFrame = null;
        cleanupCardReveal = window.initBlogCardReveal?.() || null;
      });
    }

    function updatePageUI() {
      const titleEl = document.querySelector(".page-title");
      if (titleEl) {
        titleEl.textContent = currentCategory === ALL_CATEGORY ? "总览" : currentCategory;
      }

      const isLocalBookmarkView = isBookmarkView();
      const title = `${currentCategory === ALL_CATEGORY ? "总览" : currentCategory} — Share Everything`;
      const description = isLocalBookmarkView
        ? "浏览当前浏览器中保存的本地收藏文章。"
        : currentSearch
        ? `搜索“${currentSearch}”的相关文章`
        : currentCategory === ALL_CATEGORY
          ? "探索所有文章，按分类浏览，搜索你感兴趣的内容。"
          : `浏览「${currentCategory}」分类下的文章`;
      const seoUrl = isLocalBookmarkView ? "/blog.html" : window.location.href;
      const seoRobots = isLocalBookmarkView ? "noindex, nofollow" : null;
      if (typeof window.updateSeoMeta === "function") {
        window.updateSeoMeta({
          title,
          description,
          url: seoUrl,
          canonicalUrl: seoUrl,
          robots: seoRobots,
        });
      } else {
        document.title = title;
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
          metaDescription.content = description;
        }
      }

      const topActions = document.querySelectorAll(".top-actions .action-btn");
      topActions.forEach((button) => button.classList.remove("active"));

      topActions.forEach((button) => {
        if (isBookmarkView() && button.dataset.nav === "bookmarks") {
          button.classList.add("active");
        } else if (!isBookmarkView() && button.dataset.nav === "overview") {
          button.classList.add("active");
        }
      });
    }

    function normalizeCategoryNavItem(category) {
      if (!category || typeof category !== "object") return null;
      const name = typeof category.name === "string" ? category.name.trim() : "";
      if (!name) return null;
      return {
        ...category,
        name,
        label: typeof category.label === "string" && category.label.trim() ? category.label.trim() : name,
        emoji: typeof category.emoji === "string" && category.emoji.trim() ? category.emoji.trim() : "",
      };
    }

    function updateRemoteCategories(nextCategories) {
      if (!hasRemoteSource || !Array.isArray(nextCategories) || nextCategories.length === 0) {
        return false;
      }

      const seen = new Set();
      const normalizedCategories = nextCategories
        .map(normalizeCategoryNavItem)
        .filter((category) => {
          if (!category) return false;
          const key = category.name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

      if (normalizedCategories.length === 0) {
        return false;
      }

      const previousSignature = JSON.stringify(categories.map((category) => [
        category.name,
        category.label,
        category.emoji,
      ]));
      const nextSignature = JSON.stringify(normalizedCategories.map((category) => [
        category.name,
        category.label,
        category.emoji,
      ]));
      if (previousSignature === nextSignature) {
        return false;
      }

      categories = normalizedCategories;
      validCategories = new Set([...categories.map((cat) => cat.name), BOOKMARK_CATEGORY]);
      return true;
    }

    function renderFilters() {
      filtersEl.replaceChildren();

      categories.forEach((category) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `filter-btn${category.name === currentCategory ? " active" : ""}`;
        button.dataset.category = category.name;
        button.setAttribute("aria-pressed", category.name === currentCategory ? "true" : "false");
        button.textContent = `${category.emoji ? `${category.emoji} ` : ""}${category.label || category.name}`;
        filtersEl.appendChild(button);
      });
    }

    function buildListingUrl() {
      if (isBookmarkView()) {
        return buildBookmarkListingUrl({
          pathname: window.location.pathname,
          search: currentSearch,
          page: currentPage,
        });
      }

      const nextParams = new URLSearchParams();
      if (currentCategory !== ALL_CATEGORY) nextParams.set("category", currentCategory);
      if (currentSearch) nextParams.set("search", currentSearch);
      if (currentPage > 1) nextParams.set("page", String(currentPage));

      const qs = nextParams.toString();
      return qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    }

    function syncListingUrl(historyMode = HISTORY_MODE_REPLACE) {
      const resolvedHistoryMode = historyMode === HISTORY_MODE_PUSH
        ? HISTORY_MODE_PUSH
        : HISTORY_MODE_REPLACE;
      const nextUrl = buildListingUrl();
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

      if (nextUrl !== currentUrl) {
        if (resolvedHistoryMode === HISTORY_MODE_PUSH) {
          history.pushState(null, "", nextUrl);
        } else {
          history.replaceState(null, "", nextUrl);
        }
      }

      if (typeof siteUtils.rememberBlogReturnUrl === "function") {
        siteUtils.rememberBlogReturnUrl(window.location.href);
      }
    }

    function renderCard(post, index = 0) {
      const esc = escapeText;
      // Defense-in-depth: category colors may come from site config via the API.
      const catColor = post.categoryColor || getCategoryColor(post.category);
      const bookmarked = bookmarkManager.isBookmarked(post.id);

      const safeTitle = esc(post.title);
      const safeExcerpt = esc(post.excerpt);
      const safeCategory = esc(post.categoryLabel || post.category);
      const safeCoverEmoji = esc(post.coverEmoji || "📝");
      const safeCoverGradient =
        typeof siteUtils.sanitizeCoverBackground === "function"
          ? siteUtils.sanitizeCoverBackground(post.coverGradient, DEFAULT_COVER_GRADIENT)
          : DEFAULT_COVER_GRADIENT;
      const safeCoverImage = resolveSafeCoverImage(post);
      const safePostUrl =
        typeof siteUtils.buildPostPath === "function"
          ? siteUtils.buildPostPath(post.id)
          : `/posts/${encodeURIComponent(post.id)}`;
      const eagerCoverCount = isMobileDeviceViewport()
        ? MOBILE_EAGER_COVER_IMAGE_COUNT
        : EAGER_COVER_IMAGE_COUNT;
      const shouldLoadCoverEagerly = index < eagerCoverCount;
      const coverLoading = shouldLoadCoverEagerly ? "eager" : "lazy";
      const coverFetchPriority = shouldLoadCoverEagerly ? "high" : "auto";
      const serializedTags = esc(JSON.stringify(Array.isArray(post.tags) ? post.tags : []));
      const bookmarkTitle = bookmarked ? "取消收藏" : "收藏";
      const bookmarkAriaLabel = `${bookmarkTitle}文章：${post.title || "Untitled"}`;
      const categoryHtml = post.category
        ? `<div class="blog-card-category" style="background: ${sanitizeCssColor(catColor.bg, FALLBACK_CATEGORY_COLOR.bg)}; color: ${sanitizeCssColor(catColor.color, FALLBACK_CATEGORY_COLOR.color)}; border-color: ${sanitizeCssColor(catColor.border, FALLBACK_CATEGORY_COLOR.border)}">${safeCategory}</div>`
        : "";
      const metaItems = [];

      if (post.date) {
        metaItems.push(`
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                ${esc(post.date)}
              </span>
        `);
      }

      if (post.readTime) {
        metaItems.push(`
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                ${esc(post.readTime)}
              </span>
        `);
      }
      const coverHtml = safeCoverImage
        ? `<div class="blog-card-cover-placeholder blog-card-cover-img" data-cover-gradient="${esc(safeCoverGradient)}" data-cover-emoji="${safeCoverEmoji}" style="background: ${DEFAULT_COVER_GRADIENT}">
             <span class="blog-card-cover-fallback" aria-hidden="true"></span>
             <img src="${esc(safeCoverImage)}" alt="${safeTitle}" width="640" height="360" loading="${coverLoading}" decoding="async" fetchpriority="${coverFetchPriority}">
           </div>`
        : `<div class="blog-card-cover-placeholder" data-cover-gradient="${esc(safeCoverGradient)}" data-cover-emoji="${safeCoverEmoji}" style="background: ${safeCoverGradient}">
             <span class="blog-card-cover-fallback" aria-hidden="true"></span>
           </div>`;

      return `
        <article class="blog-card" data-reveal data-post-id="${esc(post.id)}" data-post-tags="${serializedTags}" role="listitem">
          <a href="${safePostUrl}" class="blog-card-link" aria-label="阅读文章：${safeTitle}"></a>
          ${coverHtml}
          <div class="blog-card-body">
            ${categoryHtml}
            <h3 class="blog-card-title">${safeTitle}</h3>
            <p class="blog-card-excerpt">${safeExcerpt}</p>
            <div class="blog-card-meta">
              ${metaItems.join("")}
              <button type="button" class="card-bookmark-btn${bookmarked ? " bookmarked" : ""}" data-bookmark-id="${esc(post.id)}" data-bookmark-title="${safeTitle}" title="${bookmarkTitle}" aria-label="${esc(bookmarkAriaLabel)}" aria-pressed="${bookmarked ? "true" : "false"}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>
            </div>
          </div>
        </article>
      `;
    }

    function restoreCoverPlaceholder(placeholder) {
      if (!(placeholder instanceof HTMLElement)) return;

      placeholder.classList.remove("blog-card-cover-img");
      placeholder.style.background = DEFAULT_COVER_GRADIENT;
      placeholder.replaceChildren();

      const fallback = document.createElement("span");
      fallback.className = "blog-card-cover-fallback";
      fallback.setAttribute("aria-hidden", "true");
      placeholder.appendChild(fallback);
    }

    function buildPaginationPages(currentPageValue, totalPagesValue) {
      if (totalPagesValue <= PAGINATION_MAX_NUMBERED_BUTTONS) {
        return Array.from({ length: totalPagesValue }, (_, index) => index + 1);
      }

      const innerLastPage = totalPagesValue - 1;
      const windowSize = (PAGINATION_SIBLING_COUNT * 2) + 1;
      let windowStart = Math.max(2, currentPageValue - PAGINATION_SIBLING_COUNT);
      let windowEnd = Math.min(innerLastPage, currentPageValue + PAGINATION_SIBLING_COUNT);
      const visibleWindowSize = windowEnd - windowStart + 1;

      if (visibleWindowSize < windowSize) {
        const missingPages = windowSize - visibleWindowSize;
        if (windowStart === 2) {
          windowEnd = Math.min(innerLastPage, windowEnd + missingPages);
        } else if (windowEnd === innerLastPage) {
          windowStart = Math.max(2, windowStart - missingPages);
        }
      }

      const pages = [1];
      for (let page = windowStart; page <= windowEnd; page += 1) {
        pages.push(page);
      }
      pages.push(totalPagesValue);

      return [...new Set(pages)].sort((left, right) => left - right);
    }

    function renderPaginationNavButton({ direction, page, disabled }) {
      const label = direction === "previous" ? "上一页" : "下一页";
      const symbol = direction === "previous" ? "&lsaquo;" : "&rsaquo;";
      const disabledAttributes = disabled ? ' disabled aria-disabled="true"' : "";
      return `<button type="button" class="page-btn page-btn-nav page-btn-${direction}" data-page="${page}" aria-label="${label}" title="${label}"${disabledAttributes}>${symbol}</button>`;
    }

    function renderPaginationPageButton(page, currentPageValue) {
      const isCurrentPage = page === currentPageValue;
      return `<button type="button" class="page-btn${isCurrentPage ? " active" : ""}" data-page="${page}" aria-label="第 ${page} 页"${isCurrentPage ? ' aria-current="page"' : ""}>${page}</button>`;
    }

    function renderPagination(data) {
      const totalPages = normalizeListingPage(data.totalPages);
      const dataCurrentPage = normalizeListingPage(data.currentPage);
      const currentPageValue = Math.min(dataCurrentPage, totalPages);
      if (totalPages <= 1) {
        paginationEl.innerHTML = "";
        return;
      }

      const pages = buildPaginationPages(currentPageValue, totalPages);
      let html = renderPaginationNavButton({
        direction: "previous",
        page: Math.max(1, currentPageValue - 1),
        disabled: currentPageValue <= 1,
      });
      let previousPage = 0;

      for (const page of pages) {
        if (previousPage > 0 && page - previousPage > 1) {
          html += '<span class="pagination-ellipsis" aria-hidden="true">&hellip;</span>';
        }
        html += renderPaginationPageButton(page, currentPageValue);
        previousPage = page;
      }

      html += renderPaginationNavButton({
        direction: "next",
        page: Math.min(totalPages, currentPageValue + 1),
        disabled: currentPageValue >= totalPages,
      });
      paginationEl.innerHTML = html;
    }

    async function loadCurrentPageData() {
      if (!isBookmarkView()) {
        return notionApi.queryPosts({
          category: currentCategory,
          search: currentSearch,
          page: currentPage,
        });
      }

      return buildBookmarkPageData({
        bookmarkManager,
        search: currentSearch,
        page: currentPage,
        pageSize,
        onBeforeRead: scheduleLegacyMetadataHydration,
      });
    }

    async function renderPosts() {
      const currentToken = ++renderToken;
      clearCardReveal();
      setGridBusy(true);
      announceStatus(currentSearch ? "正在更新搜索结果。" : "正在加载文章列表。");

      try {
        const data = await loadCurrentPageData();

        if (currentToken !== renderToken) return;
        if (updateRemoteCategories(data.categories)) {
          renderFilters();
        }
        if (currentPage !== data.currentPage) {
          currentPage = data.currentPage;
          syncListingUrl();
        }

        if (data.results.length === 0) {
          showEmptyState();
          didCompleteInitialRender = true;
          return;
        }

        emptyEl.style.display = "none";
        preloadCoverImages(data.results);
        gridEl.innerHTML = data.results.map(renderCard).join("");
        renderPagination(data);
        setGridBusy(false);
        announceStatus(buildResultsAnnouncement(data));
        revealRenderedCards();
      } catch (error) {
        if (currentToken !== renderToken) return;

        console.error("Failed to load posts:", error);
        showEmptyState({
          title: "加载失败",
          hint: describeLoadFailure(error),
          actionLabel: "重试",
          announcement: "文章加载失败，请重试。",
        });
        didCompleteInitialRender = true;
      }
    }

    function handleFilterClick(event) {
      const button = event.target.closest(".filter-btn");
      if (!button || !filtersEl.contains(button)) return;

      currentCategory = button.dataset.category || ALL_CATEGORY;
      currentPage = 1;
      syncListingUrl(HISTORY_MODE_PUSH);
      updatePageUI();
      renderFilters();
      renderPosts();
    }

    function handleSearchInput() {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        searchDebounce = null;
        currentSearch = searchInput.value.trim();
        currentPage = 1;
        syncListingUrl(HISTORY_MODE_REPLACE);
        updatePageUI();
        renderPosts();
      }, 300);
    }

    function handlePaginationClick(event) {
      const button = event.target.closest(".page-btn");
      if (!button || !paginationEl.contains(button)) return;
      if (button.disabled) return;

      const nextPage = normalizeListingPage(button.dataset.page, currentPage);
      if (nextPage === currentPage) return;

      currentPage = nextPage;
      syncListingUrl(HISTORY_MODE_PUSH);
      renderPosts();
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    function handleTopActionsClick(event) {
      const link = event.target.closest("a[href]");
      if (!link || !topActionsEl?.contains(link)) return;
      if (!isSameBlogListingPath(link.href)) return;

      const nextState = readListingStateFromUrl(link.href);
      if (!nextState) return;

      event.preventDefault();
      applyListingState(nextState, HISTORY_MODE_PUSH);
    }

    function handleGridClick(event) {
      const button = event.target.closest(".card-bookmark-btn");
      if (!button || !gridEl.contains(button)) return;

      event.preventDefault();
      event.stopPropagation();

      const postId = button.dataset.bookmarkId;
      const nowBookmarked = bookmarkManager.toggleById(postId);
      const postTitle = button.dataset.bookmarkTitle || "Untitled";
      if (nowBookmarked === null) {
        announceStatus(`收藏失败，请稍后重试：${postTitle}。`);
        return;
      }
      const bookmarkAriaLabel = `${nowBookmarked ? "取消收藏" : "收藏"}文章：${postTitle}`;

      button.classList.toggle("bookmarked", nowBookmarked);
      button.title = nowBookmarked ? "取消收藏" : "收藏";
      button.setAttribute("aria-pressed", nowBookmarked ? "true" : "false");
      button.setAttribute("aria-label", bookmarkAriaLabel);
      button.classList.remove("bounce");
      void button.offsetWidth;
      button.classList.add("bounce");
      announceStatus(nowBookmarked ? `已收藏文章：${postTitle}。` : `已取消收藏文章：${postTitle}。`);

      if (!nowBookmarked && isBookmarkView()) {
        setTimeout(() => renderPosts(), 300);
      }
    }

    function syncBookmarkButton(button) {
      const postId = button.dataset.bookmarkId;
      if (!postId) return;

      const isBookmarked = bookmarkManager.isBookmarked(postId);
      const postTitle = button.dataset.bookmarkTitle || "Untitled";
      const bookmarkAriaLabel = `${isBookmarked ? "取消收藏" : "收藏"}文章：${postTitle}`;

      button.classList.toggle("bookmarked", isBookmarked);
      button.title = isBookmarked ? "取消收藏" : "收藏";
      button.setAttribute("aria-pressed", isBookmarked ? "true" : "false");
      button.setAttribute("aria-label", bookmarkAriaLabel);
    }

    function syncRenderedBookmarkButtons() {
      gridEl.querySelectorAll(".card-bookmark-btn").forEach(syncBookmarkButton);
    }

    function handleBookmarksUpdated() {
      if (isDisposed) return;

      if (isBookmarkView()) {
        renderPosts();
        return;
      }

      syncRenderedBookmarkButtons();
    }

    function handleGridMediaError(event) {
      const image = event.target;
      if (!(image instanceof HTMLImageElement)) return;

      const placeholder = image.closest(".blog-card-cover-placeholder.blog-card-cover-img");
      if (!placeholder || !gridEl.contains(placeholder)) return;

      image.remove();
      restoreCoverPlaceholder(placeholder);
    }

    function handleEmptyStateClick(event) {
      const button = event.target.closest("[data-empty-action='retry']");
      if (!button || !emptyEl.contains(button)) return;
      renderPosts();
    }

    function bindBookmarkHashNavigation() {
      hashChangeHandler = () => {
        const nextBookmarkState = parseBookmarkListingHash(window.location.hash);

        if (nextBookmarkState.active) {
          const didChange =
            currentCategory !== BOOKMARK_CATEGORY ||
            currentSearch !== nextBookmarkState.search ||
            currentPage !== nextBookmarkState.page;

          currentCategory = BOOKMARK_CATEGORY;
          currentSearch = nextBookmarkState.search;
          currentPage = nextBookmarkState.page;

          if ((window.location.hash || "") !== nextBookmarkState.normalizedHash) {
            syncListingUrl(HISTORY_MODE_REPLACE);
          }

          if (!didChange) {
            return;
          }

          searchInput.value = currentSearch;
          updatePageUI();
          renderFilters();
          renderPosts();
          return;
        }

        if (!isBookmarkView()) {
          return;
        }

        if (!hasRemoteSource) {
          syncListingUrl(HISTORY_MODE_REPLACE);
          return;
        }

        currentCategory = ALL_CATEGORY;
        currentSearch = "";
        currentPage = 1;
        searchInput.value = currentSearch;
        updatePageUI();
        renderFilters();
        renderPosts();
      };

      window.addEventListener("hashchange", hashChangeHandler);
    }

    if (didNormalizeRoute) {
      syncListingUrl();
    }
    updatePageUI();
    renderFilters();
    searchInput.value = currentSearch;
    if (typeof siteUtils.rememberBlogReturnUrl === "function") {
      siteUtils.rememberBlogReturnUrl(window.location.href);
    }

    filtersEl.addEventListener("click", handleFilterClick);
    searchInput.addEventListener("input", handleSearchInput);
    paginationEl.addEventListener("click", handlePaginationClick);
    gridEl.addEventListener("click", handleGridClick);
    gridEl.addEventListener("error", handleGridMediaError, true);
    emptyEl.addEventListener("click", handleEmptyStateClick);
    topActionsEl?.addEventListener("click", handleTopActionsClick);
    window.addEventListener?.("bookmarks:updated", handleBookmarksUpdated);
    bindBookmarkHashNavigation();

    renderPosts();

    return () => {
      isDisposed = true;
      renderToken += 1;
      clearTimeout(searchDebounce);
      searchDebounce = null;
      filtersEl.removeEventListener("click", handleFilterClick);
      searchInput.removeEventListener("input", handleSearchInput);
      paginationEl.removeEventListener("click", handlePaginationClick);
      gridEl.removeEventListener("click", handleGridClick);
      gridEl.removeEventListener("error", handleGridMediaError, true);
      emptyEl.removeEventListener("click", handleEmptyStateClick);
      topActionsEl?.removeEventListener("click", handleTopActionsClick);
      window.removeEventListener?.("bookmarks:updated", handleBookmarksUpdated);
      if (hashChangeHandler) {
        window.removeEventListener("hashchange", hashChangeHandler);
        hashChangeHandler = null;
      }
      cleanupPreloadedCoverLinks();
      clearStatusAnnouncement();
      setGridBusy(false);
      if (statusEl) statusEl.textContent = "";
      clearCardReveal();
    };
  }

  window.PageRuntime?.register("blog", {
    init: initBlogPage,
  });
})();
