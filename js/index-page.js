(() => {
  const DEFAULT_FEATURED_CATEGORY = "精选";

  function resolveFeaturedCategoryName(sharedContent) {
    if (typeof sharedContent.getRemoteBlogCategories !== "function") {
      return DEFAULT_FEATURED_CATEGORY;
    }

    const allCategoryName = sharedContent.ALL_CATEGORY || "全部";
    const featured = sharedContent
      .getRemoteBlogCategories()
      .find((category) => category.name !== allCategoryName);
    return featured?.name || DEFAULT_FEATURED_CATEGORY;
  }

  function initIndexPage() {
    const sharedContent = window.NotionContent || window.NotionContentShared || {};
    const siteUtils = window.SiteUtils || {};
    const featuredCategory = resolveFeaturedCategoryName(sharedContent);
    const searchForm = document.getElementById("heroSearchForm");
    const searchInput = document.getElementById("heroSearch");
    const ctaHome = document.getElementById("ctaHome");
    const ctaStart = document.getElementById("ctaStart");
    const ctaWiki = document.getElementById("ctaWiki");

    if (!searchForm || !searchInput || !ctaHome || !ctaStart || !ctaWiki) {
      return null;
    }

    function navigateTo(url) {
      if (window.SPARouter?.navigate) {
        window.SPARouter.navigate(url);
      } else {
        window.location.href = url;
      }
    }

    function executeSearch() {
      const query = searchInput.value.trim();
      if (query) {
        navigateTo(`/blog.html?search=${encodeURIComponent(query)}`);
      }
    }

    function handleSearchSubmit(event) {
      event.preventDefault();
      executeSearch();
    }

    function syncButtonLabel(button, label) {
      button.setAttribute("aria-label", label);
      const tooltip = button.querySelector(".btn-tooltip");
      if (tooltip) {
        tooltip.textContent = label;
      }
    }

    ctaHome.href = "/blog.html";
    ctaStart.href = `/blog.html?category=${encodeURIComponent(featuredCategory)}`;
    syncButtonLabel(ctaStart, featuredCategory);
    ctaWiki.href =
      typeof siteUtils.buildBookmarkListingUrl === "function"
        ? siteUtils.buildBookmarkListingUrl()
        : "/blog.html#bookmarks";

    searchForm.addEventListener("submit", handleSearchSubmit);

    return () => {
      searchForm.removeEventListener("submit", handleSearchSubmit);
    };
  }

  window.PageRuntime?.register("index", {
    init: initIndexPage,
  });
})();
