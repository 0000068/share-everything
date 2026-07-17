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
import { runNamedCleanupTasks } from "./lib/cleanup-tasks.mjs";
import { VISUAL_SCENARIOS } from "./lib/visual-scenarios.mjs";
import { VISUAL_POST_ID } from "./fixtures/visual-api-fixtures.mjs";

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
const SEMANTIC_READY_TIMEOUT_MS = 12_000;
const SEMANTIC_READY_POLL_MS = 100;
const FINITE_MOTION_TIMEOUT_MS = 4_000;

const scenarios = [
  {
    name: VISUAL_SCENARIOS.mobileHome,
    path: "/",
    readiness: "home",
    viewport: { width: 390, height: 844, mobile: true },
    check: checkMobileHome,
  },
  {
    name: VISUAL_SCENARIOS.mobileBlog,
    path: "/__visual/blog.html",
    readiness: "blog",
    viewport: { width: 390, height: 844, mobile: true },
    check: checkMobileBlog,
  },
  {
    name: VISUAL_SCENARIOS.mobilePostContent,
    path: `/__visual/post.html?id=${VISUAL_POST_ID}`,
    readiness: "post-content",
    viewport: { width: 390, height: 844, mobile: true },
    check: checkMobilePostContent,
  },
  {
    name: VISUAL_SCENARIOS.mobilePostEmpty,
    path: "/__visual/post.html",
    readiness: "post-empty",
    viewport: { width: 390, height: 844, mobile: true },
    check: checkMobilePostEmpty,
  },
  {
    name: VISUAL_SCENARIOS.desktopHome,
    path: "/",
    readiness: "home",
    viewport: { width: 1280, height: 720, mobile: false },
    check: checkDesktopHome,
    afterCaptureCheck: checkFinePointerNarrowHomeReflow,
  },
  {
    name: VISUAL_SCENARIOS.desktopBlogContent,
    path: "/__visual/blog.html",
    readiness: "blog",
    viewport: { width: 1280, height: 720, mobile: false },
    check: checkDesktopBlogContent,
    afterCaptureCheck: checkFinePointerNarrowBlogReflow,
  },
  {
    name: VISUAL_SCENARIOS.desktopPostContent,
    path: `/__visual/post.html?id=${VISUAL_POST_ID}`,
    readiness: "post-content",
    viewport: { width: 1280, height: 720, mobile: false },
    check: checkDesktopPostContent,
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTemporaryDirectory(directory, { attempts = 80, retryDelayMs = 250 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      const isTransientWindowsLock = ["EBUSY", "ENOTEMPTY", "EPERM"].includes(error?.code);
      if (!isTransientWindowsLock || attempt === attempts) throw error;
      await sleep(retryDelayMs);
    }
  }
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
    "--disable-background-mode",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-domain-reliability",
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
  let child = null;
  let output = "";
  try {
    await removeTemporaryDirectory(profileDir);
    fs.mkdirSync(profileDir, { recursive: true });

    child = spawn(executable, [
      ...buildBrowserBaseArgs({ profileDir }),
      `--remote-debugging-address=${host}`,
      `--remote-debugging-port=${debugPort}`,
      "about:blank",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    const earlyBrowserFailure = new Promise((_, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        reject(new Error(`Browser exited before CDP became ready: code=${code} signal=${signal}`));
      });
    });
    const versionResponse = await Promise.race([
      waitForHttpOk(`http://${host}:${debugPort}/json/version`),
      earlyBrowserFailure,
    ]);
    const browserWebSocketUrl = JSON.parse(versionResponse.body).webSocketDebuggerUrl;
    if (!browserWebSocketUrl) {
      throw new Error("Chrome DevTools version response did not include a browser WebSocket URL");
    }

    let stopPromise = null;
    return {
      child,
      getOutput: () => output.trim(),
      stop: () => {
        stopPromise ||= (async () => {
          if (child.exitCode === null) {
            const client = createDevToolsClient(browserWebSocketUrl);
            try {
              await client.connect();
              await client.command("Browser.close", {}, 2_000).catch(() => {});
            } catch {
              // The process fallback below still provides bounded cleanup when the
              // DevTools socket has already closed or browser startup was partial.
            } finally {
              client.close();
            }
          }
          await cleanupBrowserResources(child, profileDir);
        })();
        return stopPromise;
      },
    };
  } catch (startupError) {
    try {
      await cleanupBrowserResources(child, profileDir);
    } catch (cleanupError) {
      throw new AggregateError(
        [startupError, cleanupError],
        `Browser startup failed and cleanup was incomplete: ${startupError.message}`,
        { cause: cleanupError },
      );
    }
    throw startupError;
  }
}

async function runCommandLineScreenshot({ executable, url, outputPath, viewport }) {
  const profileDir = path.join(os.tmpdir(), `share-everything-visual-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let child = null;
  let output = "";
  let operationError = null;
  let cleanupError = null;
  let screenshotBytes = null;
  try {
    try {
      await removeTemporaryDirectory(profileDir);
      fs.mkdirSync(profileDir, { recursive: true });

      child = spawn(executable, [
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

      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        output += chunk.toString();
      });

      const exitCode = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // The shared finally cleanup below still performs bounded teardown.
          }
          reject(new Error(`Timed out capturing screenshot for ${url}`));
        }, 20_000);

        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      });

      if (exitCode !== 0) {
        throw new Error(`Browser screenshot command failed for ${url} with code ${exitCode}\n${output}`);
      }

      const stats = fs.statSync(outputPath);
      assert.ok(stats.size > 10_000, `${path.basename(outputPath)} screenshot should not be blank`);
      screenshotBytes = stats.size;
    } catch (error) {
      operationError = error;
    }
  } finally {
    try {
      await cleanupBrowserResources(child, profileDir);
    } catch (error) {
      cleanupError = error;
    }
  }

  if (operationError && cleanupError) {
    throw new AggregateError(
      [operationError, cleanupError],
      `Screenshot capture failed and cleanup was incomplete: ${operationError.message}`,
      { cause: cleanupError },
    );
  }
  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
  return screenshotBytes;
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
    if (!child || child.exitCode != null) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // The process is already gone or cannot receive another signal.
      }
      finish();
    }, 2000);

    child.once("exit", finish);
    child.once("error", finish);
    try {
      child.kill();
    } catch {
      finish();
    }
  });
}

function runBoundedCleanupCommand(executable, args, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    let cleanupProcess;
    try {
      cleanupProcess = spawn(executable, args, {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {
      resolve(false);
      return;
    }

    let settled = false;
    const finish = (succeeded) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(succeeded);
    };
    const timer = setTimeout(() => {
      try {
        cleanupProcess.kill("SIGKILL");
      } catch {
        // The bounded cleanup command has already exited.
      }
      finish(false);
    }, timeoutMs);

    cleanupProcess.once("error", () => finish(false));
    cleanupProcess.once("exit", (code) => finish(code === 0));
  });
}

async function stopWindowsBrowserProcesses(child, profileDir) {
  if (process.platform !== "win32") return;

  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  if (child?.pid) {
    await runBoundedCleanupCommand(
      path.join(systemRoot, "System32", "taskkill.exe"),
      ["/PID", String(child.pid), "/T", "/F"],
    );
  }

  const escapedProfileDir = profileDir.replaceAll("'", "''");
  const cleanupScript = [
    `$profile = '${escapedProfileDir}'`,
    "$browserNames = @('chrome.exe', 'msedge.exe', 'chromium.exe', 'chromium-browser.exe')",
    "Get-CimInstance Win32_Process | Where-Object { $browserNames -contains $_.Name -and $_.CommandLine -like ('*' + $profile + '*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join("\n");
  const encodedCleanupScript = Buffer.from(cleanupScript, "utf16le").toString("base64");
  await runBoundedCleanupCommand(
    path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCleanupScript],
  );
}

async function cleanupBrowserResources(child, profileDir) {
  const cleanupErrors = [];
  try {
    await stopWindowsBrowserProcesses(child, profileDir);
    await stopProcess(child);
    await stopWindowsBrowserProcesses(null, profileDir);
  } catch (error) {
    cleanupErrors.push(error);
  }

  try {
    await removeTemporaryDirectory(profileDir);
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, `Failed to clean browser resources for ${profileDir}`);
  }
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
    const message = `Missing visual baseline: ${baselinePath}. Run npm run visual:approve only after reviewing the captured screenshots.`;
    if (isStrictVisualMode()) {
      throw markVisualRegressionFailure(new Error(message));
    }
    console.warn(message);
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

function createScenarioSeed(name) {
  let seed = 0x811c9dc5;
  for (const character of String(name || "visual")) {
    seed ^= character.codePointAt(0);
    seed = Math.imul(seed, 0x01000193);
  }
  return seed >>> 0;
}

async function installDeterministicVisualRuntime(client, scenarioName) {
  const seed = createScenarioSeed(scenarioName);
  await client.command("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      let state = ${seed};
      Math.random = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
    })();`,
  });
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

async function configureFinePointerViewport(client, viewport) {
  await client.command("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [
      { name: "hover", value: "hover" },
      { name: "any-hover", value: "hover" },
      { name: "pointer", value: "fine" },
      { name: "any-pointer", value: "fine" },
    ],
  });
  await client.command("Emulation.setTouchEmulationEnabled", {
    enabled: false,
  });
  await configureViewport(client, viewport);
}

async function navigate(client, url) {
  const loadEvent = client.waitForEvent("Page.loadEventFired", 15_000);
  await client.command("Page.navigate", { url });
  await loadEvent;
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

function buildReadinessExpression(readiness) {
  if (readiness === "home") {
    return `(() => {
      const title = document.querySelector(".hero-title");
      const search = document.querySelector(".hero-search");
      const actions = document.querySelector(".hero-cta-group");
      const canvas = document.getElementById("particles-canvas");
      const ready = document.body?.dataset.page === "index"
        && Boolean(title?.textContent.trim())
        && Boolean(search)
        && Boolean(actions)
        && Boolean(canvas);
      return {
        ready,
        page: document.body?.dataset.page || "",
        title: title?.textContent.trim() || "",
        hasSearch: Boolean(search),
        hasActions: Boolean(actions),
        hasCanvas: Boolean(canvas),
      };
    })()`;
  }

  if (readiness === "blog") {
    return `(() => {
      const grid = document.getElementById("blogGrid");
      const cards = [...(grid?.querySelectorAll(".blog-card") || [])];
      const busy = grid?.getAttribute("aria-busy") || "missing";
      const settledCardCount = cards.slice(0, 3).filter((card) => {
        const style = getComputedStyle(card);
        const hasActiveMotion = card.getAnimations().some((animation) => (
          animation.playState !== "finished" && animation.playState !== "idle"
        ));
        return card.classList.contains("visible")
          && Number.parseFloat(style.opacity) >= 0.999
          && !hasActiveMotion;
      }).length;
      const ready = document.body?.dataset.page === "blog"
        && busy === "false"
        && cards.length >= 3
        && settledCardCount === 3
        && cards.slice(0, 3).every((card) => Boolean(card.querySelector(".blog-card-title")?.textContent.trim()));
      return {
        ready,
        page: document.body?.dataset.page || "",
        busy,
        cardCount: cards.length,
        settledCardCount,
      };
    })()`;
  }

  if (readiness === "post-content") {
    return `(() => {
      const article = document.getElementById("postArticle");
      const title = article?.querySelector(".post-title");
      const content = article?.querySelector(".post-content");
      const skeleton = document.getElementById("postSkeleton");
      const empty = document.getElementById("postEmpty");
      const skeletonDisplay = skeleton ? getComputedStyle(skeleton).display : "missing";
      const emptyDisplay = empty ? getComputedStyle(empty).display : "missing";
      const blockCount = content?.children.length || 0;
      const ready = document.body?.dataset.page === "post"
        && title?.textContent.trim() === "从第一原则改善加载体验"
        && blockCount >= 8
        && Boolean(content?.querySelector(".post-callout"))
        && Boolean(content?.querySelector("pre code"))
        && skeletonDisplay === "none"
        && emptyDisplay === "none";
      return {
        ready,
        page: document.body?.dataset.page || "",
        title: title?.textContent.trim() || "",
        blockCount,
        skeletonDisplay,
        emptyDisplay,
      };
    })()`;
  }

  if (readiness === "post-empty") {
    return `(() => {
      const article = document.getElementById("postArticle");
      const skeleton = document.getElementById("postSkeleton");
      const empty = document.getElementById("postEmpty");
      const skeletonDisplay = skeleton ? getComputedStyle(skeleton).display : "missing";
      const emptyDisplay = empty ? getComputedStyle(empty).display : "missing";
      const ready = document.body?.dataset.page === "post"
        && Boolean(article)
        && skeletonDisplay === "none"
        && emptyDisplay !== "none"
        && emptyDisplay !== "missing";
      return {
        ready,
        page: document.body?.dataset.page || "",
        hasArticle: Boolean(article),
        skeletonDisplay,
        emptyDisplay,
      };
    })()`;
  }

  throw new Error(`Unknown visual readiness contract: ${readiness}`);
}

async function waitForSemanticReadiness(client, readiness, timeoutMs = SEMANTIC_READY_TIMEOUT_MS) {
  const expression = buildReadinessExpression(readiness);
  const deadline = Date.now() + timeoutMs;
  let lastState = null;

  while (Date.now() < deadline) {
    lastState = await evaluate(client, expression);
    if (lastState?.ready) return lastState;
    await sleep(SEMANTIC_READY_POLL_MS);
  }

  throw new Error(
    `Timed out waiting for visual readiness '${readiness}' after ${timeoutMs}ms: ${JSON.stringify(lastState)}`,
  );
}

async function waitForFiniteCssMotion(client) {
  return evaluate(client, `(async () => {
    const finiteAnimations = document.getAnimations({ subtree: true }).filter((animation) => {
      const isCssAnimation = typeof CSSAnimation === "undefined"
        ? typeof animation.animationName === "string"
        : animation instanceof CSSAnimation;
      const isCssTransition = typeof CSSTransition === "undefined"
        ? typeof animation.transitionProperty === "string"
        : animation instanceof CSSTransition;
      const iterations = animation.effect?.getTiming?.().iterations;
      return (isCssAnimation || isCssTransition)
        && iterations !== Infinity
        && animation.playState !== "finished"
        && animation.playState !== "idle";
    });
    if (finiteAnimations.length === 0) {
      return { count: 0, timedOut: false };
    }

    let timeoutId = null;
    const result = await Promise.race([
      Promise.allSettled(finiteAnimations.map((animation) => animation.finished))
        .then(() => ({ timedOut: false })),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve({ timedOut: true }), ${FINITE_MOTION_TIMEOUT_MS});
      }),
    ]);
    if (timeoutId !== null) clearTimeout(timeoutId);
    return { count: finiteAnimations.length, timedOut: result.timedOut };
  })()`);
}

async function stabilizeInfiniteCssMotion(client) {
  const state = await evaluate(client, `(() => {
    const failures = [];
    const animations = document.getAnimations({ subtree: true }).filter((animation) => (
      animation.effect?.getTiming?.().iterations === Infinity
      && animation.playState !== "idle"
    ));

    animations.forEach((animation) => {
      try {
        animation.pause();
        animation.currentTime = 0;
      } catch (error) {
        failures.push(error?.message || String(error));
      }
    });
    // Resolve styles after assigning a common timeline position so screenshot
    // capture cannot race a pending animation update.
    document.documentElement.getBoundingClientRect();
    return { count: animations.length, failures };
  })()`);

  assert.deepEqual(
    state?.failures || [],
    [],
    "infinite CSS animations should stabilize at one deterministic screenshot phase",
  );
  return state;
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
    const card = document.querySelector(".blog-card");
    if (!card) throw new Error("visual blog fixture did not render a real card");

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
      cardCount: document.querySelectorAll(".blog-card").length,
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
  assert.ok(metrics.cardCount >= 3, "mobile blog should render the deterministic fixture through blog-page.js");
  assert.ok(metrics.scrollWidth <= viewport.width + 1, "mobile blog should not create horizontal overflow");
  assertRectInsideViewport(metrics.cardRect, viewport, "mobile blog card");
  assertRectInsideViewport(metrics.titleRect, viewport, "mobile blog title");
  assertRectInsideViewport(metrics.buttonRect, viewport, "mobile blog bookmark button");
  assert.ok(metrics.categoryRect.right <= metrics.cardRect.right + 1, "mobile blog category should stay inside the card");
  assert.ok(metrics.buttonRect.width <= 28, "mobile blog bookmark button should stay visually small");
  assert.ok(metrics.buttonRect.height <= 28, "mobile blog bookmark button should stay visually small");
  assert.equal(metrics.buttonWidth, "21px", "mobile blog bookmark button should compute to 21px width");
  assert.equal(metrics.buttonHeight, "21px", "mobile blog bookmark button should compute to 21px height");
  const titleCenter = (metrics.titleRect.top + metrics.titleRect.bottom) / 2;
  const buttonCenter = (metrics.buttonRect.top + metrics.buttonRect.bottom) / 2;
  assert.ok(Math.abs(titleCenter - buttonCenter) <= 14, "mobile blog title and bookmark should stay on the same visual row");
  assert.equal(metrics.canvasDisabled, "true", "mobile blog particles should be disabled");
  assert.equal(metrics.canvasDisplay, "none", "mobile blog particle canvas should not render");
}

async function checkMobilePostContent(client, viewport) {
  const metrics = await evaluate(client, `(() => {
    const article = document.getElementById("postArticle");
    const title = article.querySelector(".post-title");
    const content = article.querySelector(".post-content");
    const empty = document.getElementById("postEmpty");
    const skeleton = document.getElementById("postSkeleton");
    if (!title || !content) throw new Error("visual post fixture did not render the real article renderer");
    const articleRect = article.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    return {
      htmlClass: document.documentElement.className,
      scrollWidth: document.documentElement.scrollWidth,
      articleRect: { left: articleRect.left, right: articleRect.right, width: articleRect.width, height: articleRect.height },
      titleRect: { left: titleRect.left, right: titleRect.right, width: titleRect.width, height: titleRect.height },
      title: title.textContent.trim(),
      paragraphCount: content.querySelectorAll("p").length,
      hasCallout: Boolean(content.querySelector(".post-callout")),
      hasCode: Boolean(content.querySelector("pre code")),
      emptyDisplay: getComputedStyle(empty).display,
      skeletonDisplay: getComputedStyle(skeleton).display,
    };
  })()`);

  assert.ok(metrics.htmlClass.includes("is-mobile-device-viewport"), "mobile full post should use the mobile compatibility class");
  assert.ok(metrics.scrollWidth <= viewport.width + 1, "mobile full post should not create horizontal overflow");
  assertRectInsideViewport(metrics.articleRect, viewport, "mobile full post article");
  assertRectInsideViewport(metrics.titleRect, viewport, "mobile full post title");
  assert.equal(metrics.title, "从第一原则改善加载体验", "mobile full post should render fixture metadata");
  assert.ok(metrics.paragraphCount >= 2, "mobile full post should render representative article paragraphs");
  assert.equal(metrics.hasCallout, true, "mobile full post should render rich callout content");
  assert.equal(metrics.hasCode, true, "mobile full post should render code content");
  assert.equal(metrics.emptyDisplay, "none", "mobile full post should hide the empty state");
  assert.equal(metrics.skeletonDisplay, "none", "mobile full post should hide the skeleton after loading");
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

async function checkFinePointerNarrowHomeReflow(client) {
  const viewport = { width: 320, height: 720, mobile: false };
  await configureFinePointerViewport(client, viewport);
  const metrics = await evaluate(client, `(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const title = document.querySelector(".hero-title");
    if (!title) throw new Error("fine-pointer narrow home contract requires the hero title");
    const titleRect = title.getBoundingClientRect();
    return {
      finePointer: matchMedia("(hover: hover) and (pointer: fine)").matches,
      touchFirst: matchMedia("(hover: none) and (pointer: coarse)").matches,
      narrowViewport: matchMedia("(max-width: 360px)").matches,
      htmlClass: document.documentElement.className,
      rootScrollWidth: document.documentElement.scrollWidth,
      titleClientWidth: title.clientWidth,
      titleScrollWidth: title.scrollWidth,
      titleWhiteSpace: getComputedStyle(title).whiteSpace,
      titleRect: { left: titleRect.left, right: titleRect.right, width: titleRect.width, height: titleRect.height },
    };
  })()`);

  assert.equal(metrics.finePointer, true, "320 CSS px home contract should emulate a fine pointer");
  assert.equal(metrics.touchFirst, false, "fine-pointer home contract should not match touch-first media features");
  assert.equal(metrics.narrowViewport, true, "fine-pointer home contract should match the ultra-narrow geometry breakpoint");
  assert.ok(!metrics.htmlClass.includes("is-mobile-device-viewport"), "fine-pointer narrow home should not need the touch compatibility class");
  assert.ok(metrics.rootScrollWidth <= viewport.width + 1, "fine-pointer 320px home should not hide horizontal overflow");
  assert.ok(metrics.titleScrollWidth <= metrics.titleClientWidth + 1, "fine-pointer 320px home title text must fit its content box");
  assert.equal(metrics.titleWhiteSpace, "normal", "fine-pointer 320px home title should allow a safe line break when needed");
  assertRectInsideViewport(metrics.titleRect, viewport, "fine-pointer narrow home title");
}

async function checkDesktopBlogContent(client, viewport) {
  const metrics = await evaluate(client, `(() => {
    const cards = [...document.querySelectorAll(".blog-card")];
    if (cards.length < 3) throw new Error("desktop visual blog fixture did not render all cards");
    return {
      htmlClass: document.documentElement.className,
      scrollWidth: document.documentElement.scrollWidth,
      cardRects: cards.slice(0, 3).map((card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      }),
      titleTexts: cards.slice(0, 3).map((card) => card.querySelector(".blog-card-title")?.textContent.trim()),
    };
  })()`);

  assert.ok(!metrics.htmlClass.includes("is-mobile-device-viewport"), "desktop blog should not use the mobile compatibility class");
  assert.ok(metrics.scrollWidth <= viewport.width + 1, "desktop blog should not create horizontal overflow");
  metrics.cardRects.forEach((rect, index) => assertRectInsideViewport(rect, viewport, `desktop blog card ${index + 1}`));
  assert.equal(new Set(metrics.titleTexts).size, 3, "desktop blog should render distinct real fixture cards");
}

async function checkFinePointerNarrowBlogReflow(client) {
  const viewport = { width: 320, height: 720, mobile: false };
  await configureFinePointerViewport(client, viewport);

  const metrics = await evaluate(client, `(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const grid = document.getElementById("blogGrid");
    const cards = [...(grid?.querySelectorAll(".blog-card") || [])].slice(0, 3);
    if (!grid || cards.length < 3) throw new Error("fine-pointer narrow blog contract requires three cards");
    const gridRect = grid.getBoundingClientRect();
    const cardRects = cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height };
    });
    return {
      finePointer: matchMedia("(hover: hover) and (pointer: fine)").matches,
      touchFirst: matchMedia("(hover: none) and (pointer: coarse)").matches,
      narrowViewport: matchMedia("(max-width: 768px)").matches,
      htmlClass: document.documentElement.className,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      gridColumns: getComputedStyle(grid).gridTemplateColumns,
      gridRect: { left: gridRect.left, right: gridRect.right, width: gridRect.width, height: gridRect.height },
      cardRects,
    };
  })()`);

  assert.equal(metrics.finePointer, true, "320 CSS px browser contract should emulate a fine pointer");
  assert.equal(metrics.touchFirst, false, "fine-pointer browser contract should not match touch-first media features");
  assert.equal(metrics.narrowViewport, true, "fine-pointer browser contract should match the geometry breakpoint");
  assert.ok(!metrics.htmlClass.includes("is-mobile-device-viewport"), "fine-pointer narrow blog should not need the touch compatibility class");
  assert.ok(metrics.scrollWidth <= viewport.width + 1, "fine-pointer 320px blog should not overflow the root viewport");
  assert.ok(metrics.bodyScrollWidth <= viewport.width + 1, "fine-pointer 320px blog should not overflow the body");
  assert.equal(metrics.gridColumns.trim().split(/\s+/).length, 2, "fine-pointer 320px blog should reflow to two minmax(0, 1fr) columns");
  assertRectInsideViewport(metrics.gridRect, viewport, "fine-pointer narrow blog grid");
  metrics.cardRects.forEach((rect, index) => {
    assertRectInsideViewport(rect, viewport, `fine-pointer narrow blog card ${index + 1}`);
    assert.ok(rect.width > 0 && rect.width < 160, `fine-pointer narrow blog card ${index + 1} should shrink below the old 340px minimum`);
  });
  assert.ok(Math.abs(metrics.cardRects[0].top - metrics.cardRects[1].top) < 1, "fine-pointer narrow blog should keep two cards in the first row");
}

async function checkDesktopPostContent(client, viewport) {
  const metrics = await evaluate(client, `(() => {
    const article = document.getElementById("postArticle");
    const title = article.querySelector(".post-title");
    const content = article.querySelector(".post-content");
    if (!title || !content) throw new Error("desktop visual post fixture did not render the article");
    const articleRect = article.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    return {
      htmlClass: document.documentElement.className,
      scrollWidth: document.documentElement.scrollWidth,
      articleRect: { left: articleRect.left, right: articleRect.right, width: articleRect.width, height: articleRect.height },
      titleRect: { left: titleRect.left, right: titleRect.right, width: titleRect.width, height: titleRect.height },
      contentBlocks: content.children.length,
      title: title.textContent.trim(),
    };
  })()`);

  assert.ok(!metrics.htmlClass.includes("is-mobile-device-viewport"), "desktop full post should not use the mobile compatibility class");
  assert.ok(metrics.scrollWidth <= viewport.width + 1, "desktop full post should not create horizontal overflow");
  assertRectInsideViewport(metrics.articleRect, viewport, "desktop full post article");
  assertRectInsideViewport(metrics.titleRect, viewport, "desktop full post title");
  assert.ok(metrics.articleRect.width >= 640, "desktop full post should retain a readable content measure");
  assert.ok(metrics.contentBlocks >= 8, "desktop full post should render the complete representative fixture");
  assert.equal(metrics.title, "从第一原则改善加载体验", "desktop full post should render fixture metadata");
}

async function runScenario({ debugPort, appOrigin, scenario }) {
  const client = await createPage(debugPort);
  try {
    await configureViewport(client, scenario.viewport);
    await installDeterministicVisualRuntime(client, scenario.name);
    await navigate(client, `${appOrigin}${scenario.path}`);
    try {
      await waitForSemanticReadiness(client, scenario.readiness);
      const motionState = await waitForFiniteCssMotion(client);
      if (motionState.timedOut) {
        const message = `Timed out waiting for ${motionState.count} finite CSS animations/transitions`;
        if (isStrictVisualMode()) throw new Error(message);
        console.warn(message);
      }
      await scenario.check(client, scenario.viewport);
      await stabilizeInfiniteCssMotion(client);
      const bytes = await captureScreenshot(client, scenario.name);
      await scenario.afterCaptureCheck?.(client);
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
  for (const scenario of scenarios) {
    fs.rmSync(path.join(outputDir, `${scenario.name}.png`), { force: true });
    fs.rmSync(path.join(outputDir, `${scenario.name}.diff.png`), { force: true });
  }
  fs.rmSync(path.join(outputDir, "report.json"), { force: true });

  const appPort = await getFreePort();
  const debugPort = await getFreePort();
  const appOrigin = `http://${host}:${appPort}`;
  const localServer = startLocalServer(appPort);
  let browser = null;

  let operationError = null;
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
    operationError = error;
  }

  let cleanupError = null;
  try {
    await runNamedCleanupTasks([
      { name: "browser", run: () => browser?.stop?.() },
      { name: "local server", run: () => localServer.stop() },
    ], "Visual regression cleanup failed");
  } catch (error) {
    cleanupError = error;
  }

  if (operationError && cleanupError) {
    throw new AggregateError(
      [operationError, cleanupError],
      `Visual regression failed and cleanup was incomplete: ${operationError.message}`,
      { cause: operationError },
    );
  }
  if (operationError) throw operationError;
  if (cleanupError) throw cleanupError;
}

await main();
