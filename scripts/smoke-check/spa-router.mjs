const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;

export { createHarness as createSpaRouterHarness, createRouteDocument };

async function waitForValue(readValue, message) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = readValue();
    if (value) return value;
    await new Promise((resolve) => nativeSetTimeout(resolve, 0));
  }
  throw new Error(message);
}

function createSourceLink(href) {
  return {
    getAttribute(name) {
      return name === "href" ? href : null;
    },
  };
}

function createRouteDocument({
  assetVersion = "test-runtime",
  hasContent = true,
  modulePreloads = [],
  stylesheets = [],
} = {}) {
  const nextContent = hasContent
    ? { innerHTML: '<section data-page-focus>Blog fixture</section>' }
    : null;
  const runtimeScript = assetVersion
    ? {
        getAttribute(name) {
          return name === "src" ? `/js/app.js?v=${assetVersion}` : null;
        },
      }
    : null;
  const preloadLinks = modulePreloads.map(createSourceLink);
  const stylesheetLinks = stylesheets.map(createSourceLink);
  return {
    title: "Blog fixture",
    getElementById(id) {
      return id === "spa-content" ? nextContent : null;
    },
    querySelectorAll(selector) {
      if (selector === 'link[rel="modulepreload"][href]') return preloadLinks;
      if (selector === 'link[rel="stylesheet"][href]') return stylesheetLinks;
      return [];
    },
    querySelector(selector) {
      if (selector === 'script[data-spa-runtime][src]') return runtimeScript;
      return null;
    },
  };
}

function createContentElement() {
  return {
    dataset: {},
    innerHTML: "Original page",
    offsetHeight: 100,
    style: {
      opacity: "",
      pointerEvents: "",
      transform: "",
      transition: "",
    },
    querySelectorAll() {
      return [];
    },
  };
}

function getPageId(url) {
  const pathname = new URL(url, "https://example.com/").pathname;
  if (pathname === "/" || pathname === "/index.html") return "index";
  if (pathname === "/blog.html") return "blog";
  return null;
}

function createHarness(loadBrowserScript, {
  appAssetVersion = "test-runtime",
  fetch,
  initialHref = "https://example.com/",
  initializePage = () => {},
  pageLoader,
  routeDocument = createRouteDocument(),
  setTimeout,
} = {}) {
  const content = createContentElement();
  const location = new URL(initialHref);
  const assignedUrls = [];
  const replacedUrls = [];
  const feedbackEvents = [];
  const headNodes = [];
  const historyEntries = [location.href];
  let historyIndex = 0;
  const windowListeners = new Map();
  location.assign = (url) => {
    const href = new URL(url, location.href).href;
    assignedUrls.push(href);
    historyEntries.splice(historyIndex + 1);
    historyEntries.push(href);
    historyIndex = historyEntries.length - 1;
    location.href = href;
  };
  location.replace = (url) => {
    const href = new URL(url, location.href).href;
    replacedUrls.push(href);
    historyEntries[historyIndex] = href;
    location.href = href;
  };
  const history = {
    pushState(_state, _title, url) {
      if (url == null) return;
      const href = new URL(url, location.href).href;
      historyEntries.splice(historyIndex + 1);
      historyEntries.push(href);
      historyIndex = historyEntries.length - 1;
      location.href = href;
    },
    replaceState(_state, _title, url) {
      if (url == null) return;
      const href = new URL(url, location.href).href;
      historyEntries[historyIndex] = href;
      location.href = href;
    },
  };
  function createLinkElement() {
    const attributes = new Map();
    return {
      href: "",
      rel: "",
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      getAttribute(name) {
        return attributes.get(name) || null;
      },
      remove() {
        const index = headNodes.indexOf(this);
        if (index >= 0) headNodes.splice(index, 1);
      },
    };
  }
  const document = {
    readyState: "loading",
    head: {
      appendChild(node) {
        headNodes.push(node);
        return node;
      },
    },
    scripts: [],
    addEventListener() {},
    createElement(tagName) {
      return String(tagName).toLowerCase() === "link" ? createLinkElement() : {};
    },
    getElementById(id) {
      return id === "spa-content" ? content : null;
    },
    querySelectorAll(selector) {
      if (selector === 'link[rel="modulepreload"][href]') {
        return headNodes.filter((node) => node.rel === "modulepreload" && node.href);
      }
      if (selector === 'link[rel="stylesheet"]') {
        return headNodes.filter((node) => node.rel === "stylesheet" && node.href);
      }
      return [];
    },
  };
  const timer = setTimeout || nativeSetTimeout;
  const harness = loadBrowserScript("js/spa-router.js", {
    window: {
      AppAssetVersion: appAssetVersion,
      location,
      history,
      NavigationFeedback: {
        clear() {
          feedbackEvents.push({ type: "clear" });
        },
        show(options) {
          feedbackEvents.push({ type: "show", options });
        },
      },
      addEventListener(type, handler) {
        const handlers = windowListeners.get(type) || [];
        handlers.push(handler);
        windowListeners.set(type, handlers);
      },
      PageLoaders: { blog: pageLoader },
      PageProgress: { start() {}, finish() {} },
      PageRuntime: {
        getPageIdFromUrl: getPageId,
        initializePage,
        cleanupCurrentPage() {},
      },
      requestAnimationFrame(callback) {
        callback();
        return 1;
      },
      scrollTo() {},
      setTimeout: timer,
      clearTimeout: nativeClearTimeout,
    },
    document,
    fetch,
    globals: {
      navigator: { connection: null },
      Element: class {},
      HTMLAnchorElement: class {},
      HTMLLinkElement: class {},
      DOMParser: class {
        parseFromString() {
          return routeDocument;
        }
      },
      console: { ...console, error() {} },
      setTimeout: timer,
      clearTimeout: nativeClearTimeout,
    },
  });
  return {
    assignedUrls,
    content,
    feedbackEvents,
    harness,
    headNodes,
    historyEntries,
    location,
    replacedUrls,
    dispatchWindowEvent(type) {
      (windowListeners.get(type) || []).forEach((handler) => handler({ type }));
    },
  };
}

export async function runSpaRouterChecks({ assert, loadBrowserScript }) {
  const runtimeInitError = new Error("fixture page init failed");
  const runtimeHarness = loadBrowserScript("js/runtime-core.js", {
    window: {
      location: new URL("https://example.com/"),
    },
    document: {
      body: { dataset: {} },
      head: {
        appendChild() {},
        querySelector: () => null,
        querySelectorAll: () => [],
      },
    },
  });
  runtimeHarness.window.PageRuntime.register("index", {
    init() {
      throw runtimeInitError;
    },
  });
  assert.throws(
    () => runtimeHarness.window.PageRuntime.start("index"),
    (error) => error === runtimeInitError,
    "PageRuntime should propagate synchronous init failures to its recovery boundary",
  );

  const networkFetchSignals = [];
  const networkDeadlineHarness = createHarness(loadBrowserScript, {
    fetch: async (_url, init) => {
      networkFetchSignals.push(init?.signal);
      return new Promise(() => {});
    },
    pageLoader: async () => {},
    setTimeout(callback, delay) {
      if (delay === 35_000) queueMicrotask(callback);
      else nativeSetTimeout(callback, 0);
      return 1;
    },
  });
  const networkOriginalHref = networkDeadlineHarness.location.href;
  await networkDeadlineHarness.harness.window.SPARouter.navigate("https://example.com/blog.html");
  assert.equal(
    networkDeadlineHarness.content.style.pointerEvents,
    "",
    "a network deadline should restore pointer events on the existing page",
  );
  assert.equal(
    networkDeadlineHarness.location.href,
    networkOriginalHref,
    "a network deadline should not trigger a duplicate full-page navigation",
  );
  const networkFailureFeedback = networkDeadlineHarness.feedbackEvents
    .filter((event) => event.type === "show")
    .at(-1)?.options;
  assert.match(
    networkFailureFeedback?.message || "",
    /重试/,
    "a network navigation failure should expose an accessible retry message",
  );
  assert.equal(
    typeof networkFailureFeedback?.onAction,
    "function",
    "a network navigation failure should expose a retry action",
  );
  assert.equal(networkFetchSignals.length, 1, "the first SPA attempt should issue one HTML request");
  assert.equal(
    networkFetchSignals[0]?.aborted,
    true,
    "a network deadline should abort the shared underlying HTML request",
  );
  await networkDeadlineHarness.harness.window.SPARouter.navigate("https://example.com/blog.html");
  assert.equal(
    networkFetchSignals.length,
    2,
    "an aborted HTML request must leave the pending map so a retry can start fresh work",
  );

  let loaderContext = null;
  const prepareDeadlineHarness = createHarness(loadBrowserScript, {
    fetch: async (_url, init) => ({
      ok: true,
      status: 200,
      text: async () => "<html></html>",
      requestInit: init,
    }),
    pageLoader(context) {
      loaderContext = context;
      return new Promise(() => {});
    },
    setTimeout(callback, delay) {
      if (delay === 35_000) return nativeSetTimeout(callback, 1_000);
      if (delay === 150) return nativeSetTimeout(callback, 0);
      if (delay === 10_000) return nativeSetTimeout(callback, 10);
      return nativeSetTimeout(callback, 0);
    },
  });
  await prepareDeadlineHarness.harness.window.SPARouter.navigate("https://example.com/blog.html");
  assert.equal(loaderContext?.url, "https://example.com/blog.html", "SPA should pass the complete target URL to its page loader");
  assert.ok(loaderContext?.signal instanceof AbortSignal, "SPA should pass an AbortSignal to its page loader");
  assert.equal(loaderContext.signal.aborted, true, "a preparation deadline should abort page-loader work");
  assert.equal(
    prepareDeadlineHarness.content.style.pointerEvents,
    "",
    "a preparation deadline should restore pointer events on the existing page",
  );
  assert.equal(
    prepareDeadlineHarness.assignedUrls[0],
    "https://example.com/blog.html",
    "a preparation deadline should fall back to one direct navigation",
  );

  let concurrentStylesheetLoaderCalls = 0;
  const concurrentStylesheetHarness = createHarness(loadBrowserScript, {
    appAssetVersion: "release-a",
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => "<html></html>",
    }),
    pageLoader: async () => {
      concurrentStylesheetLoaderCalls += 1;
    },
    routeDocument: createRouteDocument({
      assetVersion: "release-a",
      stylesheets: ["/css/blog-page.css?v=release-a"],
    }),
    setTimeout(callback, delay) {
      if (delay === 150) return nativeSetTimeout(callback, 0);
      if (delay === 35_000 || delay === 10_000) return nativeSetTimeout(callback, 1_000);
      return nativeSetTimeout(callback, 0);
    },
  });
  const firstStylesheetNavigation = concurrentStylesheetHarness.harness.window.SPARouter.navigate(
    "https://example.com/blog.html?view=first",
  );
  const pendingStylesheet = await waitForValue(
    () => concurrentStylesheetHarness.headNodes.find((node) => node.rel === "stylesheet"),
    "the first navigation should append its page stylesheet",
  );
  const secondStylesheetNavigation = concurrentStylesheetHarness.harness.window.SPARouter.navigate(
    "https://example.com/blog.html?view=second",
  );
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => nativeSetTimeout(resolve, 0));
  }
  assert.equal(
    concurrentStylesheetHarness.headNodes.filter((node) => node.rel === "stylesheet").length,
    1,
    "concurrent navigations should share one pending stylesheet element",
  );
  assert.equal(
    concurrentStylesheetLoaderCalls,
    0,
    "a later navigation must not run its page loader while the shared stylesheet is pending",
  );
  pendingStylesheet.onload();
  await Promise.all([firstStylesheetNavigation, secondStylesheetNavigation]);
  assert.equal(
    concurrentStylesheetLoaderCalls,
    1,
    "only the current navigation should continue after the shared stylesheet loads",
  );

  const failedStylesheetHarness = createHarness(loadBrowserScript, {
    appAssetVersion: "release-a",
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => "<html></html>",
    }),
    pageLoader: async () => {},
    routeDocument: createRouteDocument({
      assetVersion: "release-a",
      stylesheets: ["/css/blog-page.css?v=release-a"],
    }),
    setTimeout(callback, delay) {
      if (delay === 150) return nativeSetTimeout(callback, 0);
      if (delay === 35_000 || delay === 10_000) return nativeSetTimeout(callback, 1_000);
      return nativeSetTimeout(callback, 0);
    },
  });
  const firstFailedStylesheetNavigation = failedStylesheetHarness.harness.window.SPARouter.navigate(
    "https://example.com/blog.html?view=failed",
  );
  const failedStylesheet = await waitForValue(
    () => failedStylesheetHarness.headNodes.find((node) => node.rel === "stylesheet"),
    "the failed navigation should append its page stylesheet",
  );
  const secondFailedStylesheetNavigation = failedStylesheetHarness.harness.window.SPARouter.navigate(
    "https://example.com/blog.html?view=failed",
  );
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => nativeSetTimeout(resolve, 0));
  }
  failedStylesheet.onerror();
  await Promise.all([firstFailedStylesheetNavigation, secondFailedStylesheetNavigation]);
  assert.equal(
    failedStylesheetHarness.headNodes.filter((node) => node.rel === "stylesheet").length,
    0,
    "a failed dynamic stylesheet should be removed instead of being cached as loaded",
  );
  const stylesheetRetryNavigation = failedStylesheetHarness.harness.window.SPARouter.navigate(
    "https://example.com/blog.html?view=retry",
  );
  const retryStylesheet = await waitForValue(
    () => failedStylesheetHarness.headNodes.find((node) => node.rel === "stylesheet"),
    "a later navigation should retry a stylesheet after the failed pending entry is cleared",
  );
  assert.notEqual(
    retryStylesheet,
    failedStylesheet,
    "stylesheet retry should use a fresh link element",
  );
  retryStylesheet.onload();
  await stylesheetRetryNavigation;

  const staticRouteFetchUrls = [];
  let preloadsObservedByLoader = [];
  let loaderTargetUrl = null;
  const preloadHarness = createHarness(loadBrowserScript, {
    appAssetVersion: "release-a",
    fetch: async (url) => {
      staticRouteFetchUrls.push(String(url));
      return {
        ok: true,
        status: 200,
        text: async () => "<html></html>",
      };
    },
    pageLoader: async (context) => {
      loaderTargetUrl = context.url;
      preloadsObservedByLoader = preloadHarness.headNodes
        .filter((node) => node.rel === "modulepreload")
        .map((node) => node.href);
    },
    routeDocument: createRouteDocument({
      assetVersion: "release-a",
      modulePreloads: [
        "/js/notion-api.js?v=release-a",
        "/js/blog-page.js?v=release-a",
        "/js/blog-page.js?v=release-a",
      ],
    }),
    setTimeout(callback, delay) {
      if (delay === 150) return nativeSetTimeout(callback, 0);
      if (delay === 35_000 || delay === 10_000) return nativeSetTimeout(callback, 1_000);
      return nativeSetTimeout(callback, 0);
    },
  });
  const fullStaticTarget = "https://example.com/blog.html?search=spa#results";
  await preloadHarness.harness.window.SPARouter.navigate(fullStaticTarget);
  assert.deepEqual(
    staticRouteFetchUrls,
    ["https://example.com/blog.html"],
    "static index/blog HTML fetches should strip business query and hash parameters",
  );
  assert.equal(
    loaderTargetUrl,
    fullStaticTarget,
    "the page loader should still receive the complete target query/hash URL",
  );
  assert.deepEqual(
    preloadsObservedByLoader,
    [
      "https://example.com/js/notion-api.js?v=release-a",
      "https://example.com/js/blog-page.js?v=release-a",
    ],
    "target modulepreloads must exist in document.head before the page loader executes",
  );
  assert.deepEqual(
    preloadHarness.headNodes
      .filter((node) => node.rel === "modulepreload")
      .map((node) => node.href),
    [
      "https://example.com/js/notion-api.js?v=release-a",
      "https://example.com/js/blog-page.js?v=release-a",
    ],
    "SPA preparation should adopt and deduplicate same-version target modulepreloads",
  );
  assert.deepEqual(
    preloadHarness.assignedUrls,
    [],
    "same-version SPA preparation should not hard-navigate",
  );

  let missingRuntimeLoaderCalls = 0;
  const missingRuntimeHarness = createHarness(loadBrowserScript, {
    appAssetVersion: "release-a",
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => "<html></html>",
    }),
    pageLoader: async () => {
      missingRuntimeLoaderCalls += 1;
    },
    routeDocument: createRouteDocument({ assetVersion: "" }),
    setTimeout(callback, delay) {
      if (delay === 150) return nativeSetTimeout(callback, 0);
      if (delay === 35_000 || delay === 10_000) return nativeSetTimeout(callback, 1_000);
      return nativeSetTimeout(callback, 0);
    },
  });
  await missingRuntimeHarness.harness.window.SPARouter.navigate(
    "https://example.com/blog.html?search=missing-runtime",
  );
  assert.deepEqual(
    missingRuntimeHarness.assignedUrls,
    ["https://example.com/blog.html?search=missing-runtime"],
    "a fetched document without data-spa-runtime should fail closed to direct navigation",
  );
  assert.equal(
    missingRuntimeLoaderCalls,
    0,
    "an unversioned fetched document must not execute the current deployment's page loader",
  );

  const versionMismatchHarness = createHarness(loadBrowserScript, {
    appAssetVersion: "release-a",
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => "<html></html>",
    }),
    pageLoader: async () => {},
    routeDocument: createRouteDocument({
      assetVersion: "release-b",
      modulePreloads: ["/js/blog-page.js?v=release-b"],
    }),
    setTimeout(callback, delay) {
      if (delay === 150) return nativeSetTimeout(callback, 0);
      if (delay === 35_000 || delay === 10_000) return nativeSetTimeout(callback, 1_000);
      return nativeSetTimeout(callback, 0);
    },
  });
  const versionedTarget = "https://example.com/blog.html?search=version#results";
  await versionMismatchHarness.harness.window.SPARouter.navigate(versionedTarget);
  await versionMismatchHarness.harness.window.SPARouter.navigate(versionedTarget);
  assert.deepEqual(
    versionMismatchHarness.assignedUrls,
    [versionedTarget],
    "a fetched runtime-version mismatch should hard-navigate the exact query/hash target only once",
  );
  assert.equal(
    versionMismatchHarness.headNodes.filter((node) => node.rel === "modulepreload").length,
    0,
    "a mismatched fetched document must not preload incompatible modules",
  );

  const pageInitError = new Error("target page init failed");
  const initFailureTarget = "https://example.com/blog.html?search=init-failure";
  const initFailureHarness = createHarness(loadBrowserScript, {
    appAssetVersion: "release-a",
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => "<html></html>",
    }),
    initializePage(pageId) {
      if (pageId === "blog") throw pageInitError;
    },
    pageLoader: async () => {},
    routeDocument: createRouteDocument({ assetVersion: "release-a" }),
    setTimeout(callback, delay) {
      if (delay === 150) return nativeSetTimeout(callback, 0);
      if (delay === 35_000 || delay === 10_000) return nativeSetTimeout(callback, 1_000);
      return nativeSetTimeout(callback, 0);
    },
  });
  await initFailureHarness.harness.window.SPARouter.navigate(initFailureTarget);
  assert.equal(
    initFailureHarness.content.innerHTML,
    "Original page",
    "a target-page init failure must not leave the new DOM committed as a successful SPA navigation",
  );
  assert.deepEqual(
    initFailureHarness.assignedUrls,
    [],
    "a target-page init failure should not append another target history entry",
  );
  assert.deepEqual(
    initFailureHarness.replacedUrls,
    [initFailureTarget],
    "a target-page init failure should replace its failed provisional history entry",
  );
  assert.deepEqual(
    initFailureHarness.historyEntries,
    ["https://example.com/", initFailureTarget],
    "init failure recovery should leave exactly one old-page entry and one direct target entry",
  );

  let hashOnlyFetchCount = 0;
  const hashOnlyHarness = createHarness(loadBrowserScript, {
    initialHref: "https://example.com/blog.html#bookmarks",
    fetch: async () => {
      hashOnlyFetchCount += 1;
      throw new Error("hash-only history should not fetch");
    },
    pageLoader: async () => {},
  });
  hashOnlyHarness.location.href = "https://example.com/blog.html";
  hashOnlyHarness.dispatchWindowEvent("popstate");
  assert.equal(
    hashOnlyFetchCount,
    0,
    "hash-only popstate should stay in the page-local hash flow",
  );
  assert.equal(
    hashOnlyHarness.content.innerHTML,
    "Original page",
    "hash-only popstate should not clean up or replace the current DOM",
  );

  const invalidStructureHarness = createHarness(loadBrowserScript, {
    appAssetVersion: "release-a",
    fetch: async () => ({
      ok: true,
      status: 200,
      text: async () => "<html></html>",
    }),
    pageLoader: async () => {},
    routeDocument: createRouteDocument({ assetVersion: "release-a", hasContent: false }),
    setTimeout(callback, delay) {
      if (delay === 150) return nativeSetTimeout(callback, 0);
      if (delay === 35_000 || delay === 10_000) return nativeSetTimeout(callback, 1_000);
      return nativeSetTimeout(callback, 0);
    },
  });
  await invalidStructureHarness.harness.window.SPARouter.navigate("https://example.com/blog.html");
  assert.deepEqual(
    invalidStructureHarness.assignedUrls,
    ["https://example.com/blog.html"],
    "an invalid fetched DOM contract should use one direct-navigation fallback",
  );
}
