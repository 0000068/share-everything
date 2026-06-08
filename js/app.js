import "./font-loader.js?v=20260608-v84";
import "./notion-content-shared.js?v=20260608-v84";
import "./runtime-core.js?v=20260608-v84";
import "./site-utils.js?v=20260608-v84";
import "./common.js?v=20260608-v84";
import "./ui-effects.js?v=20260608-v84";
import "./seo-meta.js?v=20260608-v84";
import "./spa-router.js?v=20260608-v84";

const ASSET_VERSION = "20260608-v84";
const versioned = (path) => `${path}?v=${ASSET_VERSION}`;
window.AppAssetVersion = ASSET_VERSION;

async function loadPostRenderingChain() {
  await import(versioned("./notion-content-utils.js"));
  await import(versioned("./notion-content-url.js"));
  await import(versioned("./notion-article-renderer.js"));
  await import(versioned("./notion-content.js"));
  await Promise.all([
    import(versioned("./notion-api.js")),
    import(versioned("./bookmark.js")),
  ]);
}

const pageLoaders = {
  index: () => import(versioned("./index-page.js")),
  blog: async () => {
    await loadPostRenderingChain();
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
}

async function bootInitialPage() {
  if (!loader) {
    window.PageRuntime?.start?.();
    return;
  }

  try {
    await loader();
  } catch (error) {
    markInitialPageLoadFailure(error);
    return;
  }

  window.PageRuntime?.start?.();
}

bootInitialPage();
