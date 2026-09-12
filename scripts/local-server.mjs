import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnvFile } from "./lib/dotenv.mjs";
import { getVisualApiFixture } from "./fixtures/visual-api-fixtures.mjs";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

await loadDotEnvFile(path.join(rootDir, ".env"));

// Enable development-mode behavior (e.g. template hot-reload) before loading
// API handlers that inspect NODE_ENV at require time.
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development";
}

const port = Number.parseInt(process.env.PORT || "4173", 10) || 4173;
const host = process.env.HOST || "127.0.0.1";
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "application/javascript; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"],
]);
const apiHandlerSpecifiers = new Map([
  ["/api/cover", "../api/cover.js"],
  ["/api/image", "../api/image.js"],
  ["/api/notion", "../api/notion.js"],
  ["/api/post", "../api/post.js"],
  ["/api/post-data", "../api/post-data.js"],
  ["/api/posts-data", "../api/posts-data.js"],
  ["/api/robots", "../api/robots.js"],
  ["/api/sitemap", "../api/sitemap.js"],
]);
const apiHandlers = new Map();
if (process.env.LOCAL_SERVER_LIFECYCLE_PROBE === "1") {
  apiHandlerSpecifiers.set(
    "/api/__lifecycle-probe",
    "./fixtures/local-server-lifecycle-probe.cjs",
  );
}
const deniedStaticRootSegments = new Set(["api", "node_modules", "server", "scripts"]);

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getErrorStatusCode(error) {
  const statusCode = Number(error?.statusCode || error?.status);
  return Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600
    ? statusCode
    : 500;
}

function isMissingStaticFileError(error) {
  return error?.code === "ENOENT" || error?.code === "ENOTDIR";
}

function readQuery(url) {
  const query = {};
  url.searchParams.forEach((value, key) => {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      query[key] = Array.isArray(query[key]) ? [...query[key], value] : [query[key], value];
      return;
    }

    query[key] = value;
  });
  return query;
}

function getApiHandler(pathname) {
  const specifier = apiHandlerSpecifiers.get(pathname);
  if (!specifier) return null;
  if (apiHandlers.has(pathname)) {
    return apiHandlers.get(pathname);
  }

  const handler = require(specifier);
  if (typeof handler !== "function") {
    throw createHttpError(500, `Invalid API handler for ${pathname}`);
  }

  apiHandlers.set(pathname, handler);
  return handler;
}

function createApiResponse(res) {
  let statusCode = 200;
  const headers = new Map();
  let didWriteHead = false;

  function setHeader(name, value) {
    const normalizedName = String(name).toLowerCase();
    headers.set(normalizedName, {
      name: String(name),
      value,
    });
  }

  function removeHeader(name) {
    headers.delete(String(name).toLowerCase());
  }

  function writeHead() {
    if (didWriteHead) return;
    headers.forEach((header) => res.setHeader(header.name, header.value));
    res.statusCode = statusCode;
    didWriteHead = true;
  }

  return {
    get headersSent() {
      return res.headersSent || didWriteHead;
    },
    get writableEnded() {
      return Boolean(res.writableEnded);
    },
    get finished() {
      return Boolean(res.finished);
    },
    setHeader,
    removeHeader,
    getHeader(name) {
      return headers.get(String(name).toLowerCase())?.value;
    },
    status(code) {
      statusCode = Number(code) || 200;
      return this;
    },
    json(payload) {
      if (!headers.has("content-type")) {
        setHeader("Content-Type", "application/json; charset=utf-8");
      }
      writeHead();
      res.end(JSON.stringify(payload));
      return payload;
    },
    send(payload) {
      writeHead();
      res.end(payload);
      return payload;
    },
    write(payload) {
      writeHead();
      return res.write(payload);
    },
    once(eventName, listener) {
      res.once(eventName, listener);
      return this;
    },
    removeListener(eventName, listener) {
      res.removeListener(eventName, listener);
      return this;
    },
    listenerCount(eventName) {
      return res.listenerCount(eventName);
    },
    destroy() {
      writeHead();
      res.destroy();
    },
    end(payload = "") {
      writeHead();
      res.end(payload);
      return payload;
    },
  };
}

async function invokeApiHandler(handler, req, res, query = {}) {
  // Every public API in this project is read-only (the legacy generic proxy is
  // disabled). Never aggregate an unsupported request body before its method
  // guard can return 405; drain it in streaming mode so memory stays bounded.
  if (req.method !== "GET" && req.method !== "HEAD") {
    req.resume();
  }
  const handlerRequest = {
    method: req.method,
    headers: req.headers,
    query,
    body: undefined,
    url: req.url,
    once: req.once.bind(req),
    removeListener: req.removeListener.bind(req),
    get aborted() {
      return req.aborted;
    },
  };
  await handler(handlerRequest, createApiResponse(res));
}

function isDeniedStaticPath(relativePath) {
  const segments = String(relativePath || "")
    .split(path.sep)
    .filter(Boolean);
  const rootSegment = segments[0]?.toLowerCase() || "";

  return (
    deniedStaticRootSegments.has(rootSegment) ||
    segments.some((segment) => segment.startsWith("."))
  );
}

async function serveStatic(url, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    throw createHttpError(400, "Bad request");
  }

  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(rootDir, `.${pathname}`);
  const relativePath = path.relative(rootDir, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw createHttpError(403, "Forbidden");
  }
  if (isDeniedStaticPath(relativePath)) {
    throw createHttpError(403, "Forbidden");
  }

  let data;
  try {
    data = await readFile(filePath);
  } catch (error) {
    if (isMissingStaticFileError(error)) {
      throw createHttpError(404, "Not found");
    }
    throw error;
  }
  res.writeHead(200, {
    "Content-Type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
  });
  res.end(data);
}

function isVisualStaticTemplateRoute(url) {
  return process.env.VISUAL_REGRESSION_STATIC_TEMPLATES === "1"
    && url.pathname.startsWith("/__visual/")
    && url.pathname.endsWith(".html");
}

function isVisualFixtureRequest(req) {
  if (process.env.VISUAL_REGRESSION_STATIC_TEMPLATES !== "1") return false;
  try {
    const referer = new URL(String(req.headers.referer || ""));
    return referer.protocol === "http:"
      && referer.host === String(req.headers.host || "")
      && referer.pathname.startsWith("/__visual/");
  } catch {
    return false;
  }
}

function serveVisualApiFixture(req, url, res) {
  if (!isVisualFixtureRequest(req)) return false;
  const payload = getVisualApiFixture(url);
  if (!payload) return false;
  const body = JSON.stringify(payload);
  res.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(body);
  return true;
}

const server = createServer(async (req, res) => {
  try {
    let url;
    try {
      url = new URL(req.url || "/", `http://${host}:${port}`);
    } catch {
      throw createHttpError(400, "Invalid request URL");
    }
    if (serveVisualApiFixture(req, url, res)) {
      return;
    }
    if (isVisualStaticTemplateRoute(url)) {
      await serveStatic(new URL(url.pathname.slice("/__visual".length), `http://${host}:${port}`), res);
      return;
    }

    const postMatch = url.pathname.match(/^\/posts\/([^/?#]+)\/?$/);
    if (postMatch) {
      let postId;
      try {
        postId = decodeURIComponent(postMatch[1]);
      } catch {
        throw createHttpError(400, "Invalid post URL encoding");
      }
      const routeQuery = readQuery(url);
      const hadQueryId = Object.prototype.hasOwnProperty.call(routeQuery, "id");
      await invokeApiHandler(getApiHandler("/api/post"), req, res, {
        ...routeQuery,
        id: postId,
        ...(hadQueryId ? { __requestQueryId: routeQuery.id } : {}),
      });
      return;
    }

    if (url.pathname === "/post.html") {
      await invokeApiHandler(getApiHandler("/api/post"), req, res, readQuery(url));
      return;
    }

    const apiHandler = getApiHandler(url.pathname);
    if (apiHandler) {
      await invokeApiHandler(apiHandler, req, res, readQuery(url));
      return;
    }

    if (url.pathname === "/sitemap.xml") {
      await invokeApiHandler(getApiHandler("/api/sitemap"), req, res, readQuery(url));
      return;
    }

    if (url.pathname === "/robots.txt") {
      await invokeApiHandler(getApiHandler("/api/robots"), req, res, readQuery(url));
      return;
    }

    await serveStatic(url, res);
  } catch (error) {
    const statusCode = getErrorStatusCode(error);
    if (statusCode >= 500) {
      console.error("Local server request failed:", error);
    }

    res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(statusCode === 404 ? "Not found" : error?.message || "Internal server error");
  }
});

server.listen(port, host, () => {
  console.log(`Local server listening at http://${host}:${port}`);
});
