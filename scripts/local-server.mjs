import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

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
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"],
]);
const apiHandlers = new Map([
  ["/api/image", require("../api/image.js")],
  ["/api/notion", require("../api/notion.js")],
  ["/api/post", require("../api/post.js")],
  ["/api/post-data", require("../api/post-data.js")],
  ["/api/posts-data", require("../api/posts-data.js")],
  ["/api/robots", require("../api/robots.js")],
  ["/api/sitemap", require("../api/sitemap.js")],
]);

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

function createApiResponse(res) {
  let statusCode = 200;
  const headers = new Map();

  function setHeader(name, value) {
    headers.set(String(name), value);
  }

  function writeHead() {
    headers.forEach((value, name) => res.setHeader(name, value));
    res.statusCode = statusCode;
  }

  return {
    setHeader,
    getHeader(name) {
      return headers.get(String(name)) || headers.get(String(name).toLowerCase());
    },
    status(code) {
      statusCode = Number(code) || 200;
      return this;
    },
    json(payload) {
      if (!headers.has("Content-Type")) {
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
    end(payload = "") {
      writeHead();
      res.end(payload);
      return payload;
    },
  };
}

async function invokeApiHandler(handler, req, res, query = {}) {
  await handler({
    method: req.method,
    headers: req.headers,
    query,
  }, createApiResponse(res));
}

async function serveStatic(url, res) {
  let pathname = "";
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${host}:${port}`);

  try {
    if (isVisualStaticTemplateRoute(url)) {
      await serveStatic(new URL(url.pathname.slice("/__visual".length), `http://${host}:${port}`), res);
      return;
    }

    const postMatch = url.pathname.match(/^\/posts\/([^/?#]+)/);
    if (postMatch) {
      await invokeApiHandler(apiHandlers.get("/api/post"), req, res, {
        id: decodeURIComponent(postMatch[1]),
      });
      return;
    }

    if (url.pathname === "/post.html") {
      await invokeApiHandler(apiHandlers.get("/api/post"), req, res, readQuery(url));
      return;
    }

    const apiHandler = apiHandlers.get(url.pathname);
    if (apiHandler) {
      await invokeApiHandler(apiHandler, req, res, readQuery(url));
      return;
    }

    if (url.pathname === "/sitemap.xml") {
      await invokeApiHandler(apiHandlers.get("/api/sitemap"), req, res, readQuery(url));
      return;
    }

    if (url.pathname === "/robots.txt") {
      await invokeApiHandler(apiHandlers.get("/api/robots"), req, res, readQuery(url));
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
