(() => {
  function initIndexPage() {
    const sharedContent = window.NotionContent || {};
    const siteUtils = window.SiteUtils || {};
    const featuredCategory =
      typeof sharedContent.getRemoteBlogCategories === "function"
        ? sharedContent.getRemoteBlogCategories().find((category) => category.name !== (sharedContent.ALL_CATEGORY || "全部"))?.name || "精选"
        : "精选";
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

    function canWarmRemote() {
      const conn =
        navigator.connection ||
        navigator.mozConnection ||
        navigator.webkitConnection ||
        null;
      if (!conn) return true;
      if (conn.saveData) return false;
      return !/(^|-)2g$/.test(conn.effectiveType || "");
    }

    function warmBlogListing() {
      if (!canWarmRemote()) return;
      const notionApi = window.NotionAPI;
      if (typeof notionApi?.queryPosts !== "function") return;
      notionApi.queryPosts({}).catch(() => {});
    }

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(warmBlogListing, { timeout: 2500 });
    } else {
      window.setTimeout(warmBlogListing, 1500);
    }

    return () => {
      searchForm.removeEventListener("submit", handleSearchSubmit);
    };
  }

  window.PageRuntime?.register("index", {
    init: initIndexPage,
  });
})();
