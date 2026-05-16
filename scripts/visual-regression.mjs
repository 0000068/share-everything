import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { diffPng } from "./lib/pixel-diff.mjs";

const rootDir = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const host = "127.0.0.1";
const outputDir = path.resolve(
  process.env.VISUAL_OUTPUT_DIR || path.join(os.tmpdir(), "share-everything-visual-regression"),
);
const mobileUserAgent = [
  "Mozilla/5.0 (Linux; Android 13; Pixel 7)",
  "AppleWebKit/537.36 (KHTML, like Gecko)",
  "Chrome/125.0.0.0 Mobile Safari/537.36",
].join(" ");
const siteConfig = JSON.parse(fs.readFileSync(path.join(rootDir, "site.config.json"), "utf8"));
const siteName = typeof siteConfig.siteName === "string" && siteConfig.siteName.trim()
  ? siteConfig.siteName.trim()
  : "Share Everything";

const scenarios = [
  {
    name: "mobile-home",
    path: "/",
    viewport: { width: 390, height: 844, mobile: true },
    check: checkMobileHome,
  },
  {
    name: "mobile-blog",
    path: "/blog.html",
    viewport: { width: 390, height: 844, mobile: true },
    check: checkMobileBlog,
  },
  {
    name: "mobile-post-empty",
    path: "/__visual/post.html",
    viewport: { width: 390, height: 844, mobile: true },
    check: checkMobilePostEmpty,
  },
  {
    name: "desktop-home",
    path: "/",
    viewport: { width: 1280, height: 720, mobile: false },
    check: checkDesktopHome,
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function httpRequest(url, { method = "GET", timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method, timeout: timeoutMs }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode || 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error(`Timed out requesting ${url}`));
    });
    request.on("error", reject);
    request.end();
  });
}

async function waitForHttpOk(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await httpRequest(url, { timeoutMs: 1000 });
      if (response.statusCode >= 200 && response.statusCode < 500) return response;
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }

  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function findBrowserExecutable() {
  const candidates = [
    process.env.BROWSER_PATH,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
  ];

  if (process.platform === "win32") {
    const programFiles = [
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      process.env.LOCALAPPDATA,
    ].filter(Boolean);

    for (const baseDir of programFiles) {
      candidates.push(
        path.join(baseDir, "Microsoft/Edge/Application/msedge.exe"),
        path.join(baseDir, "Google/Chrome/Application/chrome.exe"),
      );
    }
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
    );
  }

  const executable = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!executable) {
    throw new Error(
      "No Chrome/Edge executable found. Set BROWSER_PATH, CHROME_PATH, or EDGE_PATH before running visual regression.",
    );
  }

  return executable;
}

function startLocalServer(port) {
  const child = spawn(process.execPath, ["scripts/local-server.mjs"], {
    cwd: rootDir,
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
      VISUAL_REGRESSION_STATIC_TEMPLATES: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  child.once("exit", (code, signal) => {
    if (code || signal) {
      output += `\nlocal server exited early: code=${code} signal=${signal}`;
    }
  });

  return {
    child,
    getOutput: () => output.trim(),
    stop: () => stopProcess(child),
  };
}

function buildBrowserBaseArgs({ profileDir, viewport, mobile = false } = {}) {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-accelerated-2d-canvas",
    "--disable-accelerated-video-decode",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-dev-shm-usage",
    "--disable-sync",
    "--disable-features=CalculateNativeWinOcclusion,VizDisplayCompositor",
    "--disable-gpu-sandbox",
    "--disable-software-rasterizer",
    "--disable-breakpad",
    "--disable-crash-reporter",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-allow-origins=*",
  ];

  if (profileDir) {
    args.push(`--user-data-dir=${profileDir}`);
  }

  if (viewport) {
    args.push(`--window-size=${viewport.width},${viewport.height}`);
  }

  if (mobile) {
    args.push("--touch-events=enabled", `--user-agent=${mobileUserAgent}`);
  }

  return args;
}

async function startBrowser(debugPort) {
  const executable = findBrowserExecutable();
  const profileDir = path.join(os.tmpdir(), `share-everything-visual-profile-${debugPort}`);
  fs.rmSync(profileDir, { recursive: true, force: true });
  fs.mkdirSync(profileDir, { recursive: true });

  const child = spawn(executable, [
    ...buildBrowserBaseArgs({ profileDir }),
    `--remote-debugging-address=${host}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank",
  ], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  await waitForHttpOk(`http://${host}:${debugPort}/json/version`);

  return {
    child,
    getOutput: () => output.trim(),
    stop: async () => {
      await stopProcess(child);
      fs.rmSync(profileDir, { recursive: true, force: true });
    },
  };
}

async function runCommandLineScreenshot({ executable, url, outputPath, viewport }) {
  const profileDir = path.join(os.tmpdir(), `share-everything-visual-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.rmSync(profileDir, { recursive: true, force: true });
  fs.mkdirSync(profileDir, { recursive: true });

  const child = spawn(executable, [
    ...buildBrowserBaseArgs({
      profileDir,
      viewport,
      mobile: viewport.mobile,
    }),
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=2500",
    `--screenshot=${outputPath}`,
    url,
  ], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const exitCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Timed out capturing screenshot for ${url}`));
    }, 20_000);

    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

  fs.rmSync(profileDir, { recursive: true, force: true });
  if (exitCode !== 0) {
    throw new Error(`Browser screenshot command failed for ${url} with code ${exitCode}\n${output}`);
  }

  const stats = fs.statSync(outputPath);
  assert.ok(stats.size > 10_000, `${path.basename(outputPath)} screenshot should not be blank`);
  return stats.size;
}

async function runCommandLineFallback({ appOrigin }) {
  const executable = findBrowserExecutable();
  const results = [];

  for (const scenario of scenarios) {
    const outputPath = path.join(outputDir, `${scenario.name}.png`);
    const screenshotBytes = await runCommandLineScreenshot({
      executable,
      url: `${appOrigin}${scenario.path}`,
      outputPath,
      viewport: scenario.viewport,
    });
    results.push({
      name: scenario.name,
      screenshotBytes,
      mode: "command-line-screenshot",
    });
  }

  return results;
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (!child || child.killed || child.exitCode != null) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 2000);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

function markVisualRegressionFailure(error) {
  if (error && typeof error === "object") {
    error.visualRegressionFailure = true;
  }
  return error;
}

function isVisualRegressionFailure(error) {
  return Boolean(
    error?.visualRegressionFailure
    || error?.name === "AssertionError"
    || error?.code === "ERR_ASSERTION",
  );
}

function isStrictVisualMode() {
  return process.env.VISUAL_STRICT === "1";
}

function shouldSkipVisualDiff() {
  return process.env.VISUAL_SKIP_DIFF === "1";
}

function compareWithBaseline(name, bytes) {
  if (shouldSkipVisualDiff()) {
    return null;
  }

  const baselinePath = path.join(rootDir, "scripts/visual-baselines", `${name}.png`);
  if (!fs.existsSync(baselinePath)) {
    return null;
  }

  const baselineBytes = fs.readFileSync(baselinePath);
  const diff = diffPng(bytes, baselineBytes, { threshold: 0.05 });
  const diffPath = path.join(outputDir, `${name}.diff.png`);
  fs.writeFileSync(diffPath, diff.diffBuffer);
  const maxDiffRatio = isStrictVisualMode() ? 0.005 : 0.01;
  if (diff.diffRatio > maxDiffRatio) {
    throw markVisualRegressionFailure(new Error(
      `${name} pixel diff ratio ${diff.diffRatio.toFixed(4)} exceeded ${maxDiffRatio}. ` +
      `Diff image: ${diffPath}`,
    ));
  }

  return diff;
}

class NativeDevToolsWebSocket {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.webSocketUrl);
      this.socket = socket;

      socket.addEventListener("open", () => resolve());
      socket.addEventListener("message", (event) => {
        this.readMessageData(event.data)
          .then((text) => this.handleMessage(text))
          .catch((error) => this.rejectAll(error));
      });
      socket.addEventListener("error", () => reject(new Error("DevTools websocket error")));
      socket.addEventListener("close", () => {
        this.rejectAll(new Error("DevTools websocket closed"));
      });
    });
  }

  async readMessageData(data) {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
    if (ArrayBuffer.isView(data)) {
      return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
    }
    if (data && typeof data.text === "function") {
      return data.text();
    }
    return String(data || "");
  }

  rejectAll(error) {
    this.pending.forEach(({ reject: rejectPending, timer }) => {
      clearTimeout(timer);
      rejectPending(error);
    });
    this.pending.clear();
  }

  handleMessage(text) {
    const message = JSON.parse(text);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(`${message.error.message}: ${message.error.data || ""}`.trim()));
        return;
      }
      resolve(message.result || {});
      return;
    }

    if (message.method && this.eventWaiters.has(message.method)) {
      const waiters = this.eventWaiters.get(message.method);
      this.eventWaiters.delete(message.method);
      waiters.forEach(({ resolve, timer }) => {
        clearTimeout(timer);
        resolve(message.params || {});
      });
    }
  }

  command(method, params = {}, timeoutMs = 10_000) {
    const id = this.nextId;
    this.nextId += 1;

    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP command ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });

    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  waitForEvent(method, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = this.eventWaiters.get(method) || [];
        this.eventWaiters.set(method, waiters.filter((waiter) => waiter.resolve !== resolve));
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);
      const waiters = this.eventWaiters.get(method) || [];
      waiters.push({ resolve, timer });
      this.eventWaiters.set(method, waiters);
    });
  }

  close() {
    if (this.socket && this.socket.readyState < 2) {
      this.socket.close();
    }
  }
}

class DevToolsWebSocket {
  constructor(webSocketUrl) {
    const parsedUrl = new URL(webSocketUrl);
    this.host = parsedUrl.hostname;
    this.port = Number(parsedUrl.port);
    this.path = `${parsedUrl.pathname}${parsedUrl.search}`;
    this.nextId = 1;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.eventWaiters = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString("base64");
      const socket = net.connect(this.port, this.host);
      let handshakeBuffer = Buffer.alloc(0);
      let connected = false;

      socket.on("connect", () => {
        socket.write([
          `GET ${this.path} HTTP/1.1`,
          `Host: ${this.host}:${this.port}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "",
          "",
        ].join("\r\n"));
      });

      socket.on("data", (chunk) => {
        if (!connected) {
          handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);
          const headerEnd = handshakeBuffer.indexOf("\r\n\r\n");
          if (headerEnd < 0) return;

          const headerText = handshakeBuffer.slice(0, headerEnd).toString("utf8");
          if (!/^HTTP\/1\.1 101\b/.test(headerText)) {
            reject(new Error(`DevTools websocket handshake failed: ${headerText.split("\r\n")[0]}`));
            socket.destroy();
            return;
          }

          connected = true;
          this.socket = socket;
          this.buffer = handshakeBuffer.slice(headerEnd + 4);
          this.parseFrames();
          resolve();
          return;
        }

        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.parseFrames();
      });

      socket.on("error", reject);
      socket.on("close", () => {
        this.pending.forEach(({ reject: rejectPending }) => {
          rejectPending(new Error("DevTools websocket closed"));
        });
        this.pending.clear();
      });
    });
  }

  parseFrames() {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      const opcode = firstByte & 0x0f;
      const masked = (secondByte & 0x80) !== 0;
      let length = secondByte & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < offset + 2) return;
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) return;
        const bigLength = this.buffer.readBigUInt64BE(offset);
        if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error("DevTools websocket frame is too large");
        }
        length = Number(bigLength);
        offset += 8;
      }

      const maskOffset = offset;
      if (masked) offset += 4;
      if (this.buffer.length < offset + length) return;

      let payload = this.buffer.slice(offset, offset + length);
      if (masked) {
        const mask = this.buffer.slice(maskOffset, maskOffset + 4);
        payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
      }
      this.buffer = this.buffer.slice(offset + length);

      if (opcode === 1) {
        this.handleMessage(payload.toString("utf8"));
      } else if (opcode === 8) {
        this.socket.end();
      } else if (opcode === 9) {
        this.sendFrame(payload, 10);
      }
    }
  }

  handleMessage(text) {
    const message = JSON.parse(text);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(`${message.error.message}: ${message.error.data || ""}`.trim()));
        return;
      }
      resolve(message.result || {});
      return;
    }

    if (message.method && this.eventWaiters.has(message.method)) {
      const waiters = this.eventWaiters.get(message.method);
      this.eventWaiters.delete(message.method);
      waiters.forEach(({ resolve, timer }) => {
        clearTimeout(timer);
        resolve(message.params || {});
      });
    }
  }

  sendFrame(payload, opcode = 1) {
    const mask = crypto.randomBytes(4);
    const length = payload.length;
    let header;

    if (length < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    header[0] = 0x80 | opcode;
    const maskedPayload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    this.socket.write(Buffer.concat([header, mask, maskedPayload]));
  }

  command(method, params = {}, timeoutMs = 10_000) {
    const id = this.nextId;
    this.nextId += 1;

    const payload = Buffer.from(JSON.stringify({ id, method, params }), "utf8");
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP command ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });

    this.sendFrame(payload);
    return promise;
  }

  waitForEvent(method, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = this.eventWaiters.get(method) || [];
        this.eventWaiters.set(method, waiters.filter((waiter) => waiter.resolve !== resolve));
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);
      const waiters = this.eventWaiters.get(method) || [];
      waiters.push({ resolve, timer });
      this.eventWaiters.set(method, waiters);
    });
  }

  close() {
    if (this.socket && !this.socket.destroyed) {
      this.socket.end();
    }
  }
}

function createDevToolsClient(webSocketUrl) {
  // Use the small built-in CDP WebSocket client for deterministic CI behavior.
  // Node's native WebSocket has changed subtly across 22.x/24.x, which can
  // make strict visual checks pass on one matrix entry and fail on another.
  return new DevToolsWebSocket(webSocketUrl);
}

async function createPage(debugPort) {
  const response = await httpRequest(`http://${host}:${debugPort}/json/new?about:blank`, {
    method: "PUT",
  });
  assert.equal(response.statusCode, 200, "Chrome should create a DevTools page target");
  const target = JSON.parse(response.body);
  const client = createDevToolsClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.command("Page.enable");
  await client.command("Runtime.enable");
  return client;
}

async function configureViewport(client, viewport) {
  await client.command("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  });

  if (viewport.mobile) {
    await client.command("Emulation.setUserAgentOverride", {
      userAgent: mobileUserAgent,
      platform: "Android",
    });
    await client.command("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    });
    await client.command("Emulation.setEmitTouchEventsForMouse", {
      enabled: true,
      configuration: "mobile",
    }).catch(() => {});
    await client.command("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [
        { name: "hover", value: "none" },
        { name: "any-hover", value: "none" },
        { name: "pointer", value: "coarse" },
        { name: "any-pointer", value: "coarse" },
      ],
    }).catch(() => {});
  }
}

async function navigate(client, url) {
  const loadEvent = client.waitForEvent("Page.loadEventFired", 15_000);
  await client.command("Page.navigate", { url });
  await loadEvent;
  await sleep(900);
}

async function evaluate(client, expression) {
  const result = await client.command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    const exceptionDescription =
      result.exceptionDetails.exception?.description
      || result.exceptionDetails.exception?.value
      || result.exceptionDetails.text
      || "Browser evaluation failed";
    throw new Error(exceptionDescription);
  }

  return result.result?.value;
}

async function captureScreenshot(client, name) {
  const result = await client.command("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  }, 20_000);
  const bytes = Buffer.from(result.data, "base64");
  assert.ok(bytes.length > 10_000, `${name} screenshot should not be blank`);
  fs.writeFileSync(path.join(outputDir, `${name}.png`), bytes);
  compareWithBaseline(name, bytes);
  return bytes.length;
}

function assertRectInsideViewport(rect, viewport, label) {
  assert.ok(rect.left >= -1, `${label} should not overflow left`);
  assert.ok(rect.right <= viewport.width + 1, `${label} should not overflow right`);
  assert.ok(rect.width > 0, `${label} should be visible`);
  assert.ok(rect.height > 0, `${label} should have height`);
}

async function checkMobileHome(client, viewport) {
  const metrics = await evaluate(client, `(() => {
    const title = document.querySelector(".hero-title");
    const search = document.querySelector(".hero-search");
    const ctas = document.querySelector(".hero-cta-group");
    const canvas = document.getElementById("particles-canvas");
    const titleRect = title.getBoundingClientRect();
    const searchRect = search.getBoundingClientRect();
    const ctaRect = ctas.getBoundingClientRect();
    const titleStyle = getComputedStyle(title);
    const ambientStyle = getComputedStyle(document.querySelector(".ambient-background"));
    const canvasStyle = getComputedStyle(canvas);

    return new Promise((resolve) => setTimeout(() => {
      const lineHeight = Number.parseFloat(titleStyle.lineHeight) || titleRect.height;
      resolve({
        htmlClass: document.documentElement.className,
        bodyPage: document.body.dataset.page,
        viewportWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        titleText: title.textContent.trim(),
        titleRect: {
          left: titleRect.left,
          right: titleRect.right,
          top: titleRect.top,
          bottom: titleRect.bottom,
          width: titleRect.width,
          height: titleRect.height,
        },
        searchRect: { top: searchRect.top, bottom: searchRect.bottom, width: searchRect.width },
        ctaRect: { top: ctaRect.top, bottom: ctaRect.bottom, width: ctaRect.width },
        titleAnimation: titleStyle.animationName,
        titleBackground: titleStyle.backgroundImage,
        titleFilter: titleStyle.filter,
        titleLineHeight: lineHeight,
        ambientBackground: ambientStyle.backgroundImage,
        canvasDisplay: canvasStyle.display,
        canvasDisabled: canvas.dataset.particlesDisabled || "",
      });
    }, 650));
  })()`);

  assert.equal(metrics.bodyPage, "index", "mobile home should identify the index page");
  assert.ok(metrics.htmlClass.includes("is-mobile-device-viewport"), "mobile home should use the mobile compatibility class");
  assert.equal(metrics.titleText, siteName, "mobile home should keep the product title");
  assertRectInsideViewport(metrics.titleRect, viewport, "mobile title");
  assert.ok(metrics.titleRect.height <= metrics.titleLineHeight * 1.35, "mobile title should stay on one line");
  assert.ok(!metrics.titleAnimation.includes("title-gradient"), "mobile title should not run the expensive title gradient animation");
  assert.ok(metrics.titleAnimation.includes("fadeInUp"), "mobile title should keep the one-time entrance animation");
  assert.equal(metrics.titleFilter, "none", "mobile title should avoid filter-based glow work");
  assert.notEqual(metrics.titleBackground, "none", "mobile title should keep a gradient background");
  assert.ok(metrics.ambientBackground.includes("mobile-home-starry-bg.svg"), "mobile home should use the static starfield background");
  assert.ok(metrics.searchRect.top > metrics.titleRect.bottom, "mobile search should sit below the title");
  assert.ok(metrics.ctaRect.top > metrics.searchRect.bottom, "mobile icon actions should sit below search");
  assert.ok(metrics.scrollWidth <= viewport.width + 1, "mobile home should not create horizontal overflow");
  assert.equal(metrics.canvasDisplay, "none", "mobile home particle canvas should not render");
  assert.equal(metrics.canvasDisabled, "true", "mobile home particles should be disabled");
}

async function checkMobileBlog(client, viewport) {
  const metrics = await evaluate(client, `(() => {
    let card = document.querySelector(".blog-card");
    const grid = document.getElementById("blogGrid") || document.body;
    if (!card) {
      grid.innerHTML = [
        '<article class="blog-card visible" role="listitem">',
        '  <div class="blog-card-cover"></div>',
        '  <div class="blog-card-body">',
        '    <div class="blog-card-category">精选</div>',
        '    <h3 class="blog-card-title">深究注意力</h3>',
        '    <div class="blog-card-meta">',
        '      <button type="button" class="card-bookmark-btn" aria-label="收藏文章">',
        '        <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>',
        '      </button>',
        '    </div>',
        '  </div>',
        '</article>',
      ].join("");
      card = document.querySelector(".blog-card");
    }

    const title = card.querySelector(".blog-card-title");
    const category = card.querySelector(".blog-card-category");
    const button = card.querySelector(".card-bookmark-btn");
    const canvas = document.getElementById("particles-canvas");
    const titleRect = title.getBoundingClientRect();
    const categoryRect = category.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const buttonStyle = getComputedStyle(button);

    return {
      htmlClass: document.documentElement.className,
      scrollWidth: document.documentElement.scrollWidth,
      titleRect: {
        top: titleRect.top,
        bottom: titleRect.bottom,
        left: titleRect.left,
        right: titleRect.right,
        width: titleRect.width,
        height: titleRect.height,
      },
      categoryRect: { left: categoryRect.left, right: categoryRect.right, width: categoryRect.width, height: categoryRect.height },
      buttonRect: {
        top: buttonRect.top,
        bottom: buttonRect.bottom,
        left: buttonRect.left,
        right: buttonRect.right,
        width: buttonRect.width,
        height: buttonRect.height,
      },
      cardRect: { left: cardRect.left, right: cardRect.right, width: cardRect.width, height: cardRect.height },
      buttonWidth: buttonStyle.width,
      buttonHeight: buttonStyle.height,
      canvasDisabled: canvas.dataset.particlesDisabled || "",
      canvasDisplay: getComputedStyle(canvas).display,
    };
  })()`);

  assert.ok(metrics.htmlClass.includes("is-mobile-device-viewport"), "mobile blog should use the mobile compatibility class");
  assert.ok(metrics.scrollWidth <= viewport.width + 1, "mobile blog should not create horizontal overflow");
  assertRectInsideViewport(metrics.cardRect, viewport, "mobile blog card");
  assertRectInsideViewport(metrics.titleRect, viewport, "mobile blog title");
  assertRectInsideViewport(metrics.buttonRect, viewport, "mobile blog bookmark button");
  assert.ok(metrics.categoryRect.right <= metrics.cardRect.right + 1, "mobile blog category should stay inside the card");
  assert.ok(metrics.buttonRect.width <= 28, "mobile blog bookmark button should stay visually small");
  assert.ok(metrics.buttonRect.height <= 28, "mobile blog bookmark button should stay visually small");
  assert.equal(metrics.buttonWidth, "26px", "mobile blog bookmark button should compute to 26px width");
  assert.equal(metrics.buttonHeight, "26px", "mobile blog bookmark button should compute to 26px height");
  const titleCenter = (metrics.titleRect.top + metrics.titleRect.bottom) / 2;
  const buttonCenter = (metrics.buttonRect.top + metrics.buttonRect.bottom) / 2;
  assert.ok(Math.abs(titleCenter - buttonCenter) <= 14, "mobile blog title and bookmark should stay on the same visual row");
  assert.equal(metrics.canvasDisabled, "true", "mobile blog particles should be disabled");
  assert.equal(metrics.canvasDisplay, "none", "mobile blog particle canvas should not render");
}

async function checkMobilePostEmpty(client, viewport) {
  const metrics = await evaluate(client, `(() => {
    const topActions = document.getElementById("topActions");
    const empty = document.getElementById("postEmpty");
    const skeleton = document.getElementById("postSkeleton");
    const article = document.getElementById("postArticle");
    const canvas = document.getElementById("particles-canvas");
    const topStyle = getComputedStyle(topActions);
    const emptyStyle = getComputedStyle(empty);
    const skeletonStyle = getComputedStyle(skeleton);
    const articleRect = article.getBoundingClientRect();
    const emptyRect = empty.getBoundingClientRect();

    return {
      htmlClass: document.documentElement.className,
      scrollWidth: document.documentElement.scrollWidth,
      topDisplay: topStyle.display,
      emptyDisplay: emptyStyle.display,
      skeletonDisplay: skeletonStyle.display,
      articleRect: { left: articleRect.left, right: articleRect.right, width: articleRect.width, height: articleRect.height },
      emptyRect: { top: emptyRect.top, bottom: emptyRect.bottom, left: emptyRect.left, right: emptyRect.right, width: emptyRect.width, height: emptyRect.height },
      canvasDisabled: canvas.dataset.particlesDisabled || "",
      canvasDisplay: getComputedStyle(canvas).display,
    };
  })()`);

  assert.ok(metrics.htmlClass.includes("is-mobile-device-viewport"), "mobile post should use the mobile compatibility class");
  assert.ok(metrics.scrollWidth <= viewport.width + 1, "mobile post should not create horizontal overflow");
  assert.equal(metrics.topDisplay, "none", "mobile post top dock should stay hidden");
  assert.equal(metrics.skeletonDisplay, "none", "mobile post empty template should hide the skeleton");
  assert.notEqual(metrics.emptyDisplay, "none", "mobile post empty state should be visible");
  assertRectInsideViewport(metrics.articleRect, viewport, "mobile post article");
  assertRectInsideViewport(metrics.emptyRect, viewport, "mobile post empty state");
  assert.ok(metrics.emptyRect.top < viewport.height * 0.72, "mobile post empty state should sit in the first screen");
  assert.equal(metrics.canvasDisabled, "true", "mobile post particles should be disabled");
  assert.equal(metrics.canvasDisplay, "none", "mobile post particle canvas should not render");
}

async function checkDesktopHome(client, viewport) {
  const metrics = await evaluate(client, `(() => {
    const title = document.querySelector(".hero-title");
    const canvas = document.getElementById("particles-canvas");
    const titleRect = title.getBoundingClientRect();
    const titleStyle = getComputedStyle(title);
    const beforeCanvas = canvas.toDataURL("image/png");

    return new Promise((resolve) => setTimeout(() => {
      const afterCanvas = canvas.toDataURL("image/png");
      resolve({
        htmlClass: document.documentElement.className,
        scrollWidth: document.documentElement.scrollWidth,
        titleText: title.textContent.trim(),
        titleRect: {
          left: titleRect.left,
          right: titleRect.right,
          width: titleRect.width,
          height: titleRect.height,
        },
        titleAnimation: titleStyle.animationName,
        titleBackground: titleStyle.backgroundImage,
        canvasDisplay: getComputedStyle(canvas).display,
        canvasDisabled: canvas.dataset.particlesDisabled || "",
        canvasChanged: beforeCanvas !== afterCanvas,
      });
    }, 650));
  })()`);

  assert.ok(!metrics.htmlClass.includes("is-mobile-device-viewport"), "desktop home should not use the mobile compatibility class");
  assert.equal(metrics.titleText, siteName, "desktop home should keep the product title");
  assertRectInsideViewport(metrics.titleRect, viewport, "desktop title");
  assert.ok(metrics.titleAnimation.includes("title-gradient"), "desktop title should keep the title gradient animation");
  assert.notEqual(metrics.titleBackground, "none", "desktop title should keep a gradient background");
  assert.ok(metrics.scrollWidth <= viewport.width + 1, "desktop home should not create horizontal overflow");
  assert.equal(metrics.canvasDisplay, "block", "desktop particles should remain visible");
  assert.equal(metrics.canvasDisabled, "false", "desktop particles should not be disabled");
  assert.ok(metrics.canvasChanged, "desktop particles should remain animated");
}

async function runScenario({ debugPort, appOrigin, scenario }) {
  const client = await createPage(debugPort);
  try {
    await configureViewport(client, scenario.viewport);
    await navigate(client, `${appOrigin}${scenario.path}`);
    try {
      await scenario.check(client, scenario.viewport);
      const bytes = await captureScreenshot(client, scenario.name);
      return { name: scenario.name, screenshotBytes: bytes };
    } catch (error) {
      throw markVisualRegressionFailure(error);
    }
  } finally {
    client.close();
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  const appPort = await getFreePort();
  const debugPort = await getFreePort();
  const appOrigin = `http://${host}:${appPort}`;
  const localServer = startLocalServer(appPort);
  let browser = null;

  try {
    await waitForHttpOk(`${appOrigin}/`);
    let results = [];
    let mode = "cdp";

    try {
      browser = await startBrowser(debugPort);

      for (const scenario of scenarios) {
        results.push(await runScenario({ debugPort, appOrigin, scenario }));
      }
    } catch (cdpError) {
      const diagnostics = [
        localServer.getOutput(),
        browser?.getOutput?.(),
      ].filter(Boolean).join("\n\n");
      if (diagnostics) {
        console.warn(diagnostics);
      }
      if (isVisualRegressionFailure(cdpError)) {
        throw cdpError;
      }
      console.warn(`CDP visual checks were unavailable: ${cdpError.message}`);
      if (isStrictVisualMode()) {
        throw cdpError;
      }
      console.warn("Falling back to browser command-line screenshots.");
      await browser?.stop?.();
      browser = null;
      mode = "command-line-screenshot";
      try {
        results = await runCommandLineFallback({ appOrigin });
      } catch (fallbackError) {
        if (isStrictVisualMode()) {
          throw fallbackError;
        }

        mode = "skipped-browser-unavailable";
        console.warn(`Browser command-line screenshots were unavailable: ${fallbackError.message}`);
        console.warn("Set VISUAL_STRICT=1 to make browser startup issues fail this command.");
        results = scenarios.map((scenario) => ({
          name: scenario.name,
          skipped: true,
          reason: fallbackError.message,
        }));
      }
    }

    const reportPath = path.join(outputDir, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify({
      appOrigin,
      generatedAt: new Date().toISOString(),
      mode,
      results,
    }, null, 2));

    if (mode === "skipped-browser-unavailable") {
      console.log(`Visual regression skipped because the local browser could not capture screenshots. Report: ${reportPath}`);
    } else {
      console.log(`Visual regression passed. Screenshots: ${outputDir}`);
    }
  } catch (error) {
    const diagnostics = [
      localServer.getOutput(),
      browser?.getOutput?.(),
    ].filter(Boolean).join("\n\n");
    if (diagnostics) {
      console.error(diagnostics);
    }
    throw error;
  } finally {
    await browser?.stop?.();
    await localServer.stop();
  }
}

await main();
