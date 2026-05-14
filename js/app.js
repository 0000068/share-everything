import "./font-loader.js?v=20260514-v55";
import "./notion-content-shared.js?v=20260514-v55";
import "./runtime-core.js?v=20260514-v55";
import "./site-utils.js?v=20260514-v55";
import "./common.js?v=20260514-v55";
import "./ui-effects.js?v=20260514-v55";
import "./seo-meta.js?v=20260514-v55";
import "./spa-router.js?v=20260514-v55";

const ASSET_VERSION = "20260514-v55";
const versioned = (path) => `${path}?v=${ASSET_VERSION}`;

const pageLoaders = {
  index: () => import(versioned("./index-page.js")),
  blog: () =>
    Promise.all([
      import(versioned("./notion-content-utils.js")),
      import(versioned("./notion-content-url.js")),
      import(versioned("./notion-article-renderer.js")),
      import(versioned("./notion-content.js")),
      import(versioned("./notion-api.js")),
      import(versioned("./bookmark.js")),
      import(versioned("./blog-page.js")),
    ]),
  post: () =>
    Promise.all([
      import(versioned("./notion-content-utils.js")),
      import(versioned("./notion-content-url.js")),
      import(versioned("./notion-article-renderer.js")),
      import(versioned("./notion-content.js")),
      import(versioned("./notion-api.js")),
      import(versioned("./bookmark.js")),
      import(versioned("./post-page.js")),
    ]),
};

window.PageLoaders = pageLoaders;

const initialPageId = window.PageRuntime?.getPageIdFromUrl?.() || null;
const loader = initialPageId ? pageLoaders[initialPageId] : null;

if (loader) {
  loader()
    .catch((error) => {
      console.error("Failed to load page module:", error);
    })
    .finally(() => {
      window.PageRuntime?.start?.();
    });
} else {
  window.PageRuntime?.start?.();
}
