import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = new URL("../../", import.meta.url);
const FIXTURE_BASE_ORIGIN = "https://example.com";

function read(relativePath) {
  return readFileSync(new URL(relativePath, root), "utf8");
}

function checkSyntax(relativePath) {
  const source = read(relativePath);
  if (/^\s*(?:import|export)\s/m.test(source)) {
    const result = spawnSync(process.execPath, ["--input-type=module", "--check"], {
      input: source,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || `${relativePath} should have valid module syntax`);
    return;
  }

  new vm.Script(source, {
    filename: relativePath,
  });
}

function loadCommonJsModule(relativePath, exportedNames = [], sandboxOverrides = {}) {
  const rootPath = fileURLToPath(root);
  const moduleCache = new Map();

  function toProjectPath(filename) {
    const relative = path.relative(rootPath, filename);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return null;
    }
    return relative.replace(/\\/g, "/");
  }

  function createSandboxRequire(parentRelativePath) {
    const nativeRequire = createRequire(new URL(parentRelativePath, root));

    return function sandboxRequire(specifier) {
      const resolved = nativeRequire.resolve(specifier);
      const projectPath = toProjectPath(resolved);
      if (!projectPath) {
        return nativeRequire(specifier);
      }

      if (projectPath.startsWith("node_modules/")) {
        return nativeRequire(specifier);
      }

      if (projectPath.endsWith(".json")) {
        return JSON.parse(readFileSync(resolved, "utf8"));
      }

      if (!projectPath.endsWith(".js") && !projectPath.endsWith(".cjs")) {
        return nativeRequire(specifier);
      }

      return loadProjectModule(projectPath);
    };
  }

  function loadProjectModule(projectPath, extraExportNames = []) {
    const normalizedPath = projectPath.replace(/\\/g, "/");
    const cachedModule = moduleCache.get(normalizedPath);
    if (cachedModule) {
      return cachedModule.exports;
    }

    const filename = fileURLToPath(new URL(normalizedPath, root));
    const module = { exports: {} };
    moduleCache.set(normalizedPath, module);
    const appendedExports = extraExportNames.length > 0
      ? `\nmodule.exports.__test = { ${extraExportNames.join(", ")} };`
      : "";

    vm.runInNewContext(`${read(normalizedPath)}${appendedExports}`, {
      module,
      exports: module.exports,
      require: createSandboxRequire(normalizedPath),
      __dirname: fileURLToPath(new URL(".", new URL(normalizedPath, root))),
      __filename: filename,
      process,
      console,
      Buffer,
      AbortController,
      URL,
      URLSearchParams,
      fetch,
      setTimeout,
      clearTimeout,
      ...sandboxOverrides,
    }, {
      filename,
      importModuleDynamically: (specifier) => import(specifier),
    });

    return module.exports;
  }

  return loadProjectModule(relativePath, exportedNames);
}

function withEnvOverrides(overrides, callback) {
  const entries = Object.entries(overrides);
  const previousValues = new Map(
    entries.map(([key]) => [key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined]),
  );

  try {
    entries.forEach(([key, value]) => {
      if (value == null) {
        delete process.env[key];
        return;
      }

      process.env[key] = String(value);
    });

    return callback();
  } finally {
    previousValues.forEach((value, key) => {
      if (value === undefined) {
        delete process.env[key];
        return;
      }

      process.env[key] = value;
    });
  }
}

function createClassList(initialTokens = []) {
  const tokens = new Set(initialTokens);

  return {
    add: (...nextTokens) => nextTokens.forEach((token) => tokens.add(token)),
    remove: (...nextTokens) => nextTokens.forEach((token) => tokens.delete(token)),
    toggle(token, force) {
      if (force === true) {
        tokens.add(token);
        return true;
      }
      if (force === false) {
        tokens.delete(token);
        return false;
      }
      if (tokens.has(token)) {
        tokens.delete(token);
        return false;
      }
      tokens.add(token);
      return true;
    },
    contains: (token) => tokens.has(token),
  };
}

class FakeElement {
  constructor() {
    this.listeners = new Map();
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.classList = createClassList();
    this.innerHTML = "";
    this.textContent = "";
    this.value = "";
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  removeEventListener(type, handler) {
    if (this.listeners.get(type) === handler) {
      this.listeners.delete(type);
    }
  }

  dispatch(type, event = {}) {
    const handler = this.listeners.get(type);
    if (typeof handler === "function") {
      return handler(event);
    }

    return undefined;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  contains() {
    return true;
  }
}

function createStorageMock(initialEntries = {}) {
  const store = new Map(Object.entries(initialEntries));

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] || null;
    },
    get length() {
      return store.size;
    },
  };
}

function createQuotaLimitedStorageMock({ initialEntries = {}, maxChars = 1024 } = {}) {
  const storage = createStorageMock(initialEntries);

  return {
    getItem(key) {
      return storage.getItem(key);
    },
    setItem(key, value) {
      const serializedValue = String(value);
      const nextEntries = [];
      for (let index = 0; index < storage.length; index += 1) {
        const existingKey = storage.key(index);
        if (existingKey == null || existingKey === key) continue;
        nextEntries.push([existingKey, storage.getItem(existingKey) || ""]);
      }
      nextEntries.push([String(key), serializedValue]);

      const totalChars = nextEntries.reduce(
        (sum, [entryKey, entryValue]) => sum + String(entryKey).length + String(entryValue).length,
        0,
      );
      if (totalChars > maxChars) {
        const error = new Error("Quota exceeded");
        error.name = "QuotaExceededError";
        throw error;
      }

      storage.setItem(key, serializedValue);
    },
    removeItem(key) {
      storage.removeItem(key);
    },
    clear() {
      storage.clear();
    },
    key(index) {
      return storage.key(index);
    },
    get length() {
      return storage.length;
    },
  };
}

function createHeadersMock(initialEntries = {}) {
  const headers = new Map(
    Object.entries(initialEntries).map(([key, value]) => [String(key).toLowerCase(), String(value)]),
  );

  return {
    get(name) {
      return headers.get(String(name).toLowerCase()) || null;
    },
  };
}

const publicImageDnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function createImageRequestMock({
  status = 200,
  headers = {},
  body = Buffer.alloc(0),
  onRequest = () => {},
} = {}) {
  return (url, options = {}, callback) => {
    onRequest(url, options);

    const response = new EventEmitter();
    response.statusCode = status;
    response.headers = headers;
    response.resume = () => {};
    response.destroy = (error) => {
      if (error) {
        setTimeout(() => response.emit("error", error), 0);
      }
    };

    const request = new EventEmitter();
    request.end = () => {
      setTimeout(() => {
        callback(response);
        setTimeout(() => {
          if (body?.byteLength) {
            response.emit("data", body);
          }
          response.emit("end");
        }, 0);
      }, 0);
    };
    request.destroy = (error) => {
      setTimeout(() => request.emit("error", error || new Error("request destroyed")), 0);
    };

    return request;
  };
}

function createJsonResponse(payload, { status = 200, headers = {} } = {}) {
  const serializedPayload = typeof payload === "string"
    ? payload
    : JSON.stringify(payload);

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: createHeadersMock(headers),
    async json() {
      return typeof payload === "string"
        ? JSON.parse(payload)
        : payload;
    },
    async text() {
      return serializedPayload;
    },
  };
}

function createApiResponseRecorder() {
  return {
    statusCode: 200,
    headers: new Map(),
    jsonBody: null,
    textBody: null,
    bodyChunks: [],
    headersSent: false,
    ended: false,
    setHeader(name, value) {
      this.headers.set(String(name).toLowerCase(), String(value));
      return this;
    },
    getHeader(name) {
      return this.headers.get(String(name).toLowerCase());
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      this.headersSent = true;
      this.ended = true;
      return payload;
    },
    write(payload = "") {
      const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
      this.bodyChunks.push(buffer);
      this.headersSent = true;
      return true;
    },
    send(payload) {
      this.textBody = payload;
      this.headersSent = true;
      this.ended = true;
      return payload;
    },
    end(payload = "") {
      if (payload !== "") {
        this.write(payload);
      }
      if (this.bodyChunks.length > 0) {
        this.textBody = Buffer.concat(this.bodyChunks);
      } else if (this.textBody === null) {
        this.textBody = payload;
      }
      this.headersSent = true;
      this.ended = true;
      return this.textBody;
    },
  };
}

function loadBrowserScript(relativePath, overrides = {}) {
  const filename = fileURLToPath(new URL(relativePath, root));
  const windowObject = {
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
    setTimeout,
    clearTimeout,
    fetch: overrides.fetch || globalThis.fetch,
    AbortController: overrides.AbortController || AbortController,
    ...overrides.window,
  };
  const documentObject = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => new FakeElement(),
    ...overrides.document,
  };
  const localStorage = overrides.localStorage || createStorageMock();
  const sessionStorage = overrides.sessionStorage || createStorageMock();

  const sandbox = {
    window: windowObject,
    document: documentObject,
    localStorage,
    sessionStorage,
    history: windowObject.history,
    location: windowObject.location,
    console,
    JSON,
    Date,
    URL,
    URLSearchParams,
    Promise,
    AbortController: overrides.AbortController || AbortController,
    fetch: overrides.fetch || globalThis.fetch,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: windowObject.requestAnimationFrame,
    cancelAnimationFrame: windowObject.cancelAnimationFrame,
    ...overrides.globals,
  };

  sandbox.globalThis = sandbox;
  windowObject.window = windowObject;
  windowObject.document = documentObject;

  vm.runInNewContext(read(relativePath), sandbox, {
    filename,
  });

  return {
    window: windowObject,
    document: documentObject,
    localStorage,
    sessionStorage,
  };
}

function expectIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message);
}

function expectNotIncludes(source, needle, message) {
  assert.ok(!source.includes(needle), message);
}

function extractContentSecurityPolicyMetaContent(htmlSource) {
  const match = String(htmlSource || "").match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/i,
  );
  assert.ok(match, "HTML should include a Content-Security-Policy meta tag");
  return match[1];
}

function normalizeHtml(source) {
  return String(source || "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

function createHeadMock() {
  const nodes = [];

  function matchesSelector(node, selector) {
    const tagName = String(node?.tagName || "").toLowerCase();
    if (selector === 'meta[name="description"]') {
      return tagName === "meta" && node.getAttribute("name") === "description";
    }
    if (selector === 'meta[name="robots"]') {
      return tagName === "meta" && node.getAttribute("name") === "robots";
    }
    if (selector === 'meta[property="og:title"]') {
      return tagName === "meta" && node.getAttribute("property") === "og:title";
    }
    if (selector === 'meta[property="og:description"]') {
      return tagName === "meta" && node.getAttribute("property") === "og:description";
    }
    if (selector === 'meta[property="og:type"]') {
      return tagName === "meta" && node.getAttribute("property") === "og:type";
    }
    if (selector === 'meta[property="og:url"]') {
      return tagName === "meta" && node.getAttribute("property") === "og:url";
    }
    if (selector === 'meta[property="og:image"]') {
      return tagName === "meta" && node.getAttribute("property") === "og:image";
    }
    if (selector === 'meta[property="og:image:alt"]') {
      return tagName === "meta" && node.getAttribute("property") === "og:image:alt";
    }
    if (selector === 'link[rel="canonical"]') {
      return tagName === "link" && node.getAttribute("rel") === "canonical";
    }

    return false;
  }

  return {
    appendChild(node) {
      nodes.push(node);
      node.remove = () => {
        const index = nodes.indexOf(node);
        if (index >= 0) {
          nodes.splice(index, 1);
        }
      };
      return node;
    },
    querySelector(selector) {
      return nodes.find((node) => matchesSelector(node, selector)) || null;
    },
    nodes,
  };
}

function getValueAtPath(target, path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, segment) => {
      if (value == null) {
        return value;
      }

      return value[segment];
    }, target);
}

function runNotionBlockFixture(fixture, notionContentHelpers) {
  const mappedBlocks = fixture.rawBlocks.map((block) => notionContentHelpers.mapNotionBlock(block, {
    baseOrigin: FIXTURE_BASE_ORIGIN,
  }));

  assert.equal(
    JSON.stringify(mappedBlocks.map((block) => block?.type)),
    JSON.stringify(fixture.expectedTypes),
    `${fixture.name} should map each raw Notion block to the expected block type`,
  );

  (fixture.mappedChecks || []).forEach((check) => {
    const actual = getValueAtPath(mappedBlocks[check.blockIndex], check.path);

    if (Object.prototype.hasOwnProperty.call(check, "equals")) {
      assert.equal(
        actual,
        check.equals,
        `${fixture.name} should map ${check.path} to the expected value`,
      );
    }

    if (Object.prototype.hasOwnProperty.call(check, "includes")) {
      expectIncludes(
        String(actual),
        check.includes,
        `${fixture.name} should preserve ${check.path} in the mapped block`,
      );
    }
  });

  const renderedHtml = normalizeHtml(notionContentHelpers.renderBlocks(mappedBlocks, {
    baseOrigin: FIXTURE_BASE_ORIGIN,
  }));

  (fixture.expectedHtmlIncludes || []).forEach((snippet) => {
    expectIncludes(
      renderedHtml,
      normalizeHtml(snippet),
      `${fixture.name} should render semantic HTML for the fixture`,
    );
  });

  (fixture.expectedHtmlExcludes || []).forEach((snippet) => {
    expectNotIncludes(
      renderedHtml,
      normalizeHtml(snippet),
      `${fixture.name} should avoid rendering stale fallback markup`,
    );
  });
}

function expectNoMalformedClosingTags(source, message) {
  assert.ok(
    !/(^|[^<])\/(?:p|span|a|div|button|svg|main|section|article|h1|h2|h3|title)>/m.test(source),
    message,
  );
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


export {
  assert,
  Buffer,
  FIXTURE_BASE_ORIGIN,
  FakeElement,
  checkSyntax,
  createApiResponseRecorder,
  createClassList,
  createHeadMock,
  createHeadersMock,
  createImageRequestMock,
  createJsonResponse,
  createQuotaLimitedStorageMock,
  createStorageMock,
  escapeRegex,
  expectIncludes,
  expectNoMalformedClosingTags,
  expectNotIncludes,
  extractContentSecurityPolicyMetaContent,
  getValueAtPath,
  loadBrowserScript,
  loadCommonJsModule,
  normalizeHtml,
  publicImageDnsLookup,
  read,
  runNotionBlockFixture,
  withEnvOverrides,
};
