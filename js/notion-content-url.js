(function (root, factory) {
  const sharedUtils = typeof module === "object" && module.exports
    ? require("./notion-content-utils")
    : root?.NotionContentUtils;
  const exported = factory(sharedUtils || {});

  if (typeof module === "object" && module.exports) {
    module.exports = exported;
  } else if (root) {
    root.NotionContentUrl = exported;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, (sharedUtils = {}) => {
  const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
  const SAFE_IMAGE_PROTOCOLS = new Set(["https:"]);
  const IMAGE_PROXY_PATH = "/api/image";
  const { getBaseOrigin } = sharedUtils;

  if (typeof getBaseOrigin !== "function") {
    throw new Error("notion-content-utils.js must load before notion-content-url.js");
  }

  function sanitizeUrl(candidate, allowedProtocols, baseOrigin, { allowSameOrigin = false } = {}) {
    if (!candidate || typeof candidate !== "string") return null;

    try {
      const resolvedBaseOrigin = getBaseOrigin(baseOrigin);
      const parsed = new URL(candidate, resolvedBaseOrigin);
      if (allowSameOrigin && parsed.origin === new URL(resolvedBaseOrigin).origin) {
        return parsed.href;
      }
      return allowedProtocols.has(parsed.protocol) ? parsed.href : null;
    } catch (error) {
      return null;
    }
  }

  function sanitizeCspResourceUrl(candidate, allowedProtocols, baseOrigin) {
    return sanitizeUrl(candidate, allowedProtocols, baseOrigin, {
      allowSameOrigin: true,
    });
  }

  function resolveDisplayImageUrl(candidate, baseOrigin) {
    return sanitizeCspResourceUrl(candidate, SAFE_IMAGE_PROTOCOLS, baseOrigin);
  }

  function shouldProxyDisplayImageUrl(candidate, baseOrigin) {
    if (!candidate || typeof candidate !== "string") return false;

    try {
      const resolvedBaseOrigin = getBaseOrigin(baseOrigin);
      const parsed = new URL(candidate, resolvedBaseOrigin);
      return parsed.protocol === "https:" && parsed.origin !== new URL(resolvedBaseOrigin).origin;
    } catch (error) {
      return false;
    }
  }

  function buildImageProxyUrl(candidate, baseOrigin) {
    const safeImageUrl = resolveDisplayImageUrl(candidate, baseOrigin);
    if (!safeImageUrl) return null;
    if (!shouldProxyDisplayImageUrl(safeImageUrl, baseOrigin)) return safeImageUrl;

    const resolvedBaseOrigin = getBaseOrigin(baseOrigin);
    const proxyUrl = new URL(IMAGE_PROXY_PATH, resolvedBaseOrigin);
    proxyUrl.searchParams.set("src", safeImageUrl);
    return proxyUrl.href;
  }

  // Public alias matching the higher-level "display image" terminology used by callers.
  const resolveProxiedDisplayImageUrl = buildImageProxyUrl;

  function shouldOpenLinkInNewTab(href, baseOrigin) {
    try {
      const siteOrigin = new URL(getBaseOrigin(baseOrigin)).origin;
      const targetUrl = new URL(href, siteOrigin);
      if (targetUrl.protocol === "mailto:") return true;
      return targetUrl.origin !== siteOrigin;
    } catch {
      return true;
    }
  }

  function getUrlHostname(candidate, baseOrigin) {
    if (!candidate || typeof candidate !== "string") return "";

    try {
      return new URL(candidate, getBaseOrigin(baseOrigin)).hostname.replace(/^www\./i, "");
    } catch (error) {
      return "";
    }
  }

  function resolveEmbeddableUrl(candidate, baseOrigin) {
    const safeUrl = sanitizeCspResourceUrl(candidate, SAFE_IMAGE_PROTOCOLS, baseOrigin);
    if (!safeUrl) {
      return null;
    }

    try {
      const parsed = new URL(safeUrl, getBaseOrigin(baseOrigin));
      const hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
      const pathname = parsed.pathname || "/";

      if (hostname === "youtu.be") {
        const videoId = pathname.split("/").filter(Boolean)[0];
        return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` : safeUrl;
      }

      if (hostname === "youtube.com") {
        if (pathname === "/watch") {
          const videoId = parsed.searchParams.get("v");
          return videoId ? `https://www.youtube.com/embed/${encodeURIComponent(videoId)}` : safeUrl;
        }

        const shortMatch = pathname.match(/^\/(?:shorts|embed)\/([^/?#]+)/);
        if (shortMatch?.[1]) {
          return `https://www.youtube.com/embed/${encodeURIComponent(shortMatch[1])}`;
        }
      }

      if (hostname === "player.bilibili.com" && pathname.startsWith("/player.html")) {
        return parsed.href;
      }

      if (hostname === "bilibili.com") {
        const bilibiliMatch = pathname.match(/^\/video\/((?:BV[0-9A-Za-z]+)|(?:av\d+))/i);
        if (bilibiliMatch?.[1]) {
          const page = parsed.searchParams.get("p") || "1";
          const videoId = bilibiliMatch[1];
          const query = videoId.toLowerCase().startsWith("av")
            ? `aid=${encodeURIComponent(videoId.slice(2))}&page=${encodeURIComponent(page)}`
            : `bvid=${encodeURIComponent(videoId)}&page=${encodeURIComponent(page)}`;
          return `https://player.bilibili.com/player.html?${query}`;
        }
      }

      if (hostname === "vimeo.com") {
        const vimeoMatch = pathname.match(/^\/(\d+)(?:\/([^/?#]+))?(?:\/|$)/);
        if (vimeoMatch?.[1]) {
          const embedUrl = new URL(`https://player.vimeo.com/video/${encodeURIComponent(vimeoMatch[1])}`);
          const hashToken = parsed.searchParams.get("h") || vimeoMatch[2] || "";
          if (hashToken) {
            embedUrl.searchParams.set("h", hashToken);
          }
          return embedUrl.href;
        }
      }

      if (hostname === "loom.com") {
        const loomMatch = pathname.match(/^\/(?:share|embed)\/([^/?#]+)/);
        if (loomMatch?.[1]) {
          return `https://www.loom.com/embed/${encodeURIComponent(loomMatch[1])}`;
        }
      }

      if (hostname === "codepen.io") {
        const codepenMatch = pathname.match(/^\/([^/]+)\/pen\/([^/?#]+)/);
        if (codepenMatch?.[1] && codepenMatch?.[2]) {
          return `https://codepen.io/${encodeURIComponent(codepenMatch[1])}/embed/${encodeURIComponent(codepenMatch[2])}?default-tab=result`;
        }
      }

      if (hostname === "figma.com") {
        return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(parsed.href)}`;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  function isLikelyEphemeralAssetUrl(candidate, baseOrigin) {
    if (!candidate || typeof candidate !== "string") return false;

    try {
      const parsed = new URL(candidate, getBaseOrigin(baseOrigin));
      return [
        "X-Amz-Algorithm",
        "X-Amz-Credential",
        "X-Amz-Date",
        "X-Amz-Expires",
        "X-Amz-Signature",
        "Expires",
        "Signature",
      ].some((key) => parsed.searchParams.has(key));
    } catch (error) {
      return false;
    }
  }

  function resolveShareImageUrl(candidate, fallback, baseOrigin) {
    const safeImageUrl = resolveDisplayImageUrl(candidate, baseOrigin);
    if (!safeImageUrl || isLikelyEphemeralAssetUrl(safeImageUrl, baseOrigin)) {
      return fallback;
    }

    return safeImageUrl;
  }

  return Object.freeze({
    IMAGE_PROXY_PATH,
    SAFE_IMAGE_PROTOCOLS,
    SAFE_LINK_PROTOCOLS,
    buildImageProxyUrl,
    getUrlHostname,
    isLikelyEphemeralAssetUrl,
    resolveDisplayImageUrl,
    resolveEmbeddableUrl,
    resolveProxiedDisplayImageUrl,
    resolveShareImageUrl,
    sanitizeCspResourceUrl,
    sanitizeUrl,
    shouldOpenLinkInNewTab,
    shouldProxyDisplayImageUrl,
  });
});
