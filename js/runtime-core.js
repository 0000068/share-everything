/**
 * runtime-core.js — shared runtime primitives
 */

(function initRuntimeCore() {
  function ensureStructuredDataTag(key) {
    const selector = `script[type="application/ld+json"][data-structured-data="${key}"]`;
    let script = document.head?.querySelector(selector);
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-structured-data", key);
      document.head?.appendChild(script);
    }
    return script;
  }

  function clearStructuredData(key) {
    if (!key) return;
    document.head
      ?.querySelector(`script[type="application/ld+json"][data-structured-data="${key}"]`)
      ?.remove();
  }

  function setStructuredData(key, payload) {
    if (!key) return;
    if (!payload || typeof payload !== "object") {
      clearStructuredData(key);
      return;
    }

    const script = ensureStructuredDataTag(key);
    if (!script) return;

    script.textContent = JSON.stringify(payload);
  }

  function syncStructuredDataFromDocument(sourceDocument) {
    const sourceHead = sourceDocument?.head;
    const targetHead = document.head;
    if (!sourceHead || !targetHead) return;

    const sourceScripts = Array.from(
      sourceHead.querySelectorAll('script[type="application/ld+json"][data-structured-data]'),
    );
    const sourceKeys = new Set(
      sourceScripts
        .map((script) => script.getAttribute("data-structured-data"))
        .filter(Boolean),
    );

    Array.from(targetHead.querySelectorAll('script[type="application/ld+json"][data-structured-data]'))
      .forEach((script) => {
        const key = script.getAttribute("data-structured-data");
        if (!key || !sourceKeys.has(key)) {
          script.remove();
        }
      });

    sourceScripts.forEach((sourceScript) => {
      const key = sourceScript.getAttribute("data-structured-data");
      if (!key) return;

      let targetScript = targetHead.querySelector(
        `script[type="application/ld+json"][data-structured-data="${key}"]`,
      );
      if (!targetScript) {
        targetScript = document.createElement("script");
        targetScript.type = "application/ld+json";
        targetScript.setAttribute("data-structured-data", key);
        targetHead.appendChild(targetScript);
      }

      targetScript.textContent = sourceScript.textContent || "";
    });
  }

  window.StructuredData = Object.freeze({
    set: setStructuredData,
    clear: clearStructuredData,
    syncFromDocument: syncStructuredDataFromDocument,
  });

  const PageProgress = (() => {
    let root = null;
    let bar = null;
    let trickleTimer = null;
    let hideTimer = null;
    let currentValue = 0;

    function ensureElements() {
      if (root && bar) {
        return { root, bar };
      }

      root = document.getElementById("pageProgress");
      if (!(root instanceof HTMLElement)) {
        root = document.createElement("div");
        root.id = "pageProgress";
        root.className = "page-progress";
        root.setAttribute("aria-hidden", "true");

        bar = document.createElement("span");
        bar.className = "page-progress-bar";
        root.appendChild(bar);
        document.body?.appendChild(root);
      } else {
        bar = root.querySelector(".page-progress-bar");
        if (!(bar instanceof HTMLElement)) {
          bar = document.createElement("span");
          bar.className = "page-progress-bar";
          root.appendChild(bar);
        }
      }

      return { root, bar };
    }

    function setProgress(value) {
      const nextValue = Math.max(0, Math.min(1, value));
      currentValue = nextValue;
      ensureElements().bar.style.transform = `scaleX(${nextValue})`;
    }

    function stopTrickle() {
      if (trickleTimer != null) {
        clearInterval(trickleTimer);
        trickleTimer = null;
      }
    }

    function start() {
      const elements = ensureElements();
      if (hideTimer != null) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }

      stopTrickle();
      elements.root.classList.remove("is-complete");
      elements.root.classList.add("is-visible");
      setProgress(0.08);

      trickleTimer = window.setInterval(() => {
        const delta = currentValue < 0.35
          ? 0.14
          : currentValue < 0.65
            ? 0.08
            : 0.03;
        setProgress(Math.min(0.9, currentValue + delta));
      }, 160);
    }

    function finish() {
      const elements = ensureElements();
      stopTrickle();
      elements.root.classList.add("is-visible");
      setProgress(Math.max(currentValue, 0.96));

      window.requestAnimationFrame(() => {
        setProgress(1);
        elements.root.classList.add("is-complete");

        hideTimer = window.setTimeout(() => {
          elements.root.classList.remove("is-visible", "is-complete");
          setProgress(0);
          hideTimer = null;
        }, 260);
      });
    }

    return { start, finish };
  })();

  function findPageFocusTarget(root, preferredSelectors = []) {
    if (!(root instanceof HTMLElement)) return null;

    const selectors = [
      ...preferredSelectors,
      "[data-page-focus]",
      ".page-title",
      ".post-title",
      ".hero-title",
      "h1",
    ];

    for (const selector of selectors) {
      const target = root.querySelector(selector);
      if (target instanceof HTMLElement) {
        return target;
      }
    }

    return root;
  }

  function makeTemporarilyFocusable(target) {
    if (!(target instanceof HTMLElement)) return null;

    const isNaturallyFocusable =
      target.tabIndex >= 0 ||
      target instanceof HTMLAnchorElement ||
      target instanceof HTMLButtonElement ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable;

    if (!isNaturallyFocusable && !target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
      target.dataset.spaManagedFocus = "true";
    }

    return target;
  }

  function cleanupTemporaryFocus(target) {
    if (!(target instanceof HTMLElement) || target.dataset.spaManagedFocus !== "true") {
      return;
    }

    const clearManagedFocus = () => {
      target.removeAttribute("tabindex");
      delete target.dataset.spaManagedFocus;
    };

    window.setTimeout(clearManagedFocus, 0);
  }

  function focusSpaContent({ root, preferredSelectors = [], clearPendingFocus = true } = {}) {
    if (!(root instanceof HTMLElement)) return null;

    const target = makeTemporarilyFocusable(findPageFocusTarget(root, preferredSelectors));
    if (!target) return null;

    target.focus({ preventScroll: true });
    cleanupTemporaryFocus(target);
    if (clearPendingFocus) {
      delete root.dataset.pendingFocus;
    }
    return target;
  }

  const NavigationFeedback = (() => {
    const ROOT_ID = "navigationFeedback";
    let retryButton = null;
    let retryHandler = null;

    function removeRetryHandler() {
      if (retryButton && retryHandler) {
        retryButton.removeEventListener("click", retryHandler);
      }
      retryButton = null;
      retryHandler = null;
    }

    function ensureRoot() {
      let root = document.getElementById(ROOT_ID);
      if (root) return root;

      root = document.createElement("div");
      root.id = ROOT_ID;
      root.className = "navigation-feedback";
      root.hidden = true;
      root.setAttribute("role", "alert");
      root.setAttribute("aria-live", "assertive");
      root.setAttribute("aria-atomic", "true");

      const message = document.createElement("span");
      message.className = "navigation-feedback-message";
      message.dataset.navigationFeedbackMessage = "true";
      root.appendChild(message);

      const action = document.createElement("button");
      action.type = "button";
      action.className = "navigation-feedback-action";
      action.dataset.navigationFeedbackAction = "true";
      action.hidden = true;
      root.appendChild(action);

      document.body?.appendChild(root);
      return root;
    }

    function clear() {
      removeRetryHandler();
      const root = document.getElementById(ROOT_ID);
      if (!root) return;

      root.hidden = true;
      const message = root.querySelector("[data-navigation-feedback-message]");
      if (message) message.textContent = "";
      const action = root.querySelector("[data-navigation-feedback-action]");
      if (action) {
        action.hidden = true;
        action.textContent = "";
      }
    }

    function show({ message, actionLabel = "重试", onAction } = {}) {
      if (typeof message !== "string" || !message.trim()) return null;

      const root = ensureRoot();
      const messageElement = root.querySelector("[data-navigation-feedback-message]");
      const action = root.querySelector("[data-navigation-feedback-action]");
      if (messageElement) messageElement.textContent = message.trim();

      removeRetryHandler();
      if (action && typeof onAction === "function") {
        retryButton = action;
        retryHandler = () => {
          clear();
          onAction();
        };
        action.textContent = actionLabel;
        action.hidden = false;
        action.addEventListener("click", retryHandler);
      } else if (action) {
        action.hidden = true;
        action.textContent = "";
      }

      root.hidden = false;
      return root;
    }

    return { clear, show };
  })();

  const PageRuntime = (() => {
    const registry = new Map();
    let currentCleanup = null;

    function getPageIdFromUrl(url = window.location.href) {
      const { pathname } = new URL(url, window.location.origin);
      const normalizedPath =
        pathname === "/" ? "/index.html" : pathname.endsWith("/") ? `${pathname}index.html` : pathname;

      if (normalizedPath.endsWith("/index.html")) return "index";
      if (normalizedPath.endsWith("/blog.html")) return "blog";
      if (pathname.startsWith("/posts/")) return "post";
      if (normalizedPath.endsWith("/post.html")) return "post";
      return null;
    }

    function cleanupCurrentPage() {
      if (typeof currentCleanup !== "function") {
        currentCleanup = null;
        return;
      }

      try {
        currentCleanup();
      } catch (error) {
        console.error("Page cleanup error:", error);
      } finally {
        currentCleanup = null;
      }
    }

    function initializePage(pageId = getPageIdFromUrl(window.location.href)) {
      cleanupCurrentPage();

      if (document.body) {
        document.body.dataset.page = pageId || "";
      }

      const pageModule = pageId ? registry.get(pageId) : null;
      if (!pageModule?.init) return null;

      // Initialization is part of the navigation transaction. Let failures
      // reach the initial boot or SPA recovery boundary instead of reporting a
      // page as initialized with a partially-mutated DOM.
      currentCleanup = pageModule.init() || null;

      return currentCleanup;
    }

    function register(pageId, pageModule) {
      registry.set(pageId, pageModule);
    }

    function start(pageId = getPageIdFromUrl(window.location.href)) {
      return initializePage(pageId);
    }

    return {
      getPageIdFromUrl,
      initializePage,
      cleanupCurrentPage,
      register,
      start,
    };
  })();

  window.PageProgress = PageProgress;
  window.PageRuntime = PageRuntime;
  window.NavigationFeedback = NavigationFeedback;
  window.focusSpaContent = focusSpaContent;
})();
