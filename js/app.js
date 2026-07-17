import "./notion-content-shared.js?v=20260717-v86-2a8e2e463e9a";
import "./runtime-core.js?v=20260717-v86-2a8e2e463e9a";
import "./site-utils.js?v=20260717-v86-2a8e2e463e9a";
import "./common.js?v=20260717-v86-2a8e2e463e9a";
import "./ui-effects.js?v=20260717-v86-2a8e2e463e9a";
import "./seo-meta.js?v=20260717-v86-2a8e2e463e9a";
import "./spa-router.js?v=20260717-v86-2a8e2e463e9a";

const ASSET_VERSION = "20260717-v86-2a8e2e463e9a";
const versioned = (path) => `${path}?v=${ASSET_VERSION}`;
window.AppAssetVersion = ASSET_VERSION;

function primeBlogInitialData({ url = window.location.href, signal } = {}) {
  const task = import(versioned("./blog-bootstrap.js"))
    .then(() => window.BlogBootstrap?.ensure?.(url, { signal }) || null);

  // The page API consumes the original promise once its module is ready. This
  // rejection observer prevents a fast network failure from becoming an
  // unhandled rejection while the lightweight listing modules are downloading.
  task.catch(() => {});
  return task;
}

async function loadContentFoundations() {
  await import(versioned("./notion-content-utils.js"));
  await import(versioned("./notion-content-url.js"));
}

async function loadPublicContentClients() {
  await Promise.all([
    import(versioned("./notion-api.js")),
    import(versioned("./bookmark.js")),
  ]);
}

async function loadBlogDataChain() {
  await loadContentFoundations();
  await loadPublicContentClients();
}

async function loadPostRenderingChain() {
  await loadContentFoundations();
  await import(versioned("./notion-article-renderer.js"));
  await import(versioned("./notion-content.js"));
  await loadPublicContentClients();
}

const pageLoaders = {
  index: () => import(versioned("./index-page.js")),
  blog: async (context = {}) => {
    // Wait only for the tiny bootstrap module and ensure() call, not for the
    // network response. This guarantees the list request has started before
    // the listing client can issue its normal fallback request.
    await primeBlogInitialData(context).catch(() => null);
    await loadBlogDataChain();
    await import(versioned("./blog-page.js"));
  },
  post: async () => {
    await loadPostRenderingChain();
    await import(versioned("./post-page.js"));
  },
};

window.PageLoaders = pageLoaders;

const initialPageId = window.PageRuntime?.getPageIdFromUrl?.() || null;
const loader = initialPageId ? pageLoaders[initialPageId] : null;

function markInitialPageLoadFailure(error) {
  console.error("Failed to load page module:", error);
  if (document.body) {
    document.body.dataset.pageModuleError = initialPageId || "unknown";
  }

  window.NavigationFeedback?.show?.({
    message: "页面资源加载失败，请重试。",
    actionLabel: "重新加载",
    onAction: () => {
      if (typeof window.location.reload === "function") {
        window.location.reload();
      } else {
        window.location.assign?.(window.location.href);
      }
    },
  });
}

async function bootInitialPage() {
  try {
    if (loader) {
      await loader({ url: window.location.href });
    }
    window.PageRuntime?.start?.();
  } catch (error) {
    markInitialPageLoadFailure(error);
  }
}

bootInitialPage();
