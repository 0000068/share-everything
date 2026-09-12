import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStaticSite } from "../build-static.mjs";
import { computeExpectedAssetVersion, replaceAssetVersionTokens } from "../lib/asset-fingerprint.mjs";
import { readShortSiteName } from "../lib/site-brand.mjs";
import { checkSiteBrand } from "./site-brand.mjs";
import { createJsonResponse, FakeElement, loadBrowserScript, loadCommonJsModule, read, withEnvOverrides } from "./harness.mjs";
import { createSpaRouterHarness } from "./spa-router.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function queryHarness(onQuery) {
  let queries = 0;
  const service = withEnvOverrides({
    NOTION_TOKEN: "test-token", NOTION_DATABASE_ID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS: "120000", NOTION_RETRY_MAX_ATTEMPTS: "1",
  }, () => loadCommonJsModule("server/post-service.js", [], {
    process: { ...process, env: { ...process.env } },
    fetch: async (url, options) => {
      if (new URL(url).pathname.endsWith("/query")) {
        queries += 1;
        return onQuery(queries, options);
      }
      return createJsonResponse({
        id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
          Category: { id: "category", name: "Category", type: "select", select: { options: [{ name: "Tech", color: "blue" }] } },
        },
      });
    },
  }));
  return { service, get count() { return queries; } };
}

async function checkConcurrentQueries() {
  const barrier = deferred();
  const started = deferred();
  const harness = queryHarness(async () => {
    started.resolve();
    await barrier.promise;
    return createJsonResponse({ results: [], has_more: false });
  });
  const requests = Array.from({ length: 8 }, (_, index) => harness.service.queryPublicPosts({
    category: "Tech", search: index % 2 ? "different" : "",
  }));
  await started.promise;
  await tick();
  assert.equal(harness.count, 1, "same-category cold queries, including distinct searches, must coalesce");
  barrier.resolve();
  await Promise.all(requests);
  await harness.service.queryPublicPosts({ category: "Tech" });
  assert.equal(harness.count, 1, "subsequent queries must still use the cache");

  const release = deferred();
  const running = deferred();
  let upstreamSignal;
  const shared = queryHarness(async (_count, { signal }) => {
    upstreamSignal = signal;
    running.resolve();
    await release.promise;
    return createJsonResponse({ results: [], has_more: false });
  });
  const departing = new AbortController();
  const first = shared.service.queryPublicPosts({ category: "Tech" }, { signal: departing.signal });
  const firstRejected = assert.rejects(first, { name: "AbortError" });
  const second = shared.service.queryPublicPosts({ category: "Tech" });
  await running.promise;
  await tick();
  departing.abort();
  await firstRejected;
  assert.equal(upstreamSignal.aborted, false, "one departing subscriber must not cancel other readers");
  release.resolve();
  await second;
  assert.equal(shared.count, 1);

  const abandonedStarted = deferred();
  let abandonedSignal;
  const abandoned = queryHarness(async (count, { signal }) => {
    if (count === 1) {
      abandonedSignal = signal;
      abandonedStarted.resolve();
      await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    }
    return createJsonResponse({ results: [], has_more: false });
  });
  const controller = new AbortController();
  const cancelled = abandoned.service.queryPublicPosts({ category: "Tech" }, { signal: controller.signal });
  const cancellationCheck = assert.rejects(cancelled, { name: "AbortError" });
  await abandonedStarted.promise;
  controller.abort();
  // Deliberately start before the abandoned promise's finally has run.
  const fresh = abandoned.service.queryPublicPosts({ category: "Tech" });
  await cancellationCheck;
  await fresh;
  assert.equal(abandonedSignal.aborted, true);
  assert.equal(abandoned.count, 2, "a new reader after final cancellation needs a fresh query");

  const { createKeyedSingleFlight } = loadCommonJsModule("server/cache-store.js");
  const flights = createKeyedSingleFlight({ maxEntries: 1, errorCooldownMs: 1000 });
  let attempts = 0;
  const fail = () => { attempts += 1; throw Object.assign(new Error("upstream failure"), { retryAfter: "2" }); };
  await assert.rejects(flights.run("same", fail), /upstream failure/);
  await assert.rejects(flights.run("same", fail), /upstream failure/);
  assert.equal(attempts, 1, "per-key failures must respect cooldown");
  const blocked = deferred();
  const active = flights.run("active", () => blocked.promise);
  await assert.rejects(flights.run("overflow", () => "unexpected"), (error) => error.status === 503);
  blocked.resolve("complete");
  await active;
  assert.equal(await flights.run("overflow", () => "recovered"), "recovered");
}

async function checkNavigationCancellation() {
  let fetches = 0;
  const started = deferred();
  const harness = createSpaRouterHarness(loadBrowserScript, {
    fetch: (_url, { signal }) => {
      fetches += 1;
      if (fetches > 1) return Promise.resolve({ ok: true, text: async () => "fresh document" });
      started.resolve();
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    },
    setTimeout: (callback, delay) => setTimeout(callback, delay === 150 ? 0 : delay),
  });
  const first = harness.harness.window.SPARouter.navigate("https://example.com/blog.html?search=first");
  await started.promise;
  const second = harness.harness.window.SPARouter.navigate("https://example.com/blog.html?search=second");
  await Promise.all([first, second]);
  assert.equal(fetches, 2, "superseding navigation must not subscribe to an aborted HTML entry");
  assert.equal(harness.harness.window.location.search, "?search=second");
  assert.equal(harness.feedbackEvents.filter((event) => event.type === "show").length, 0);
}

function checkContentSemantics() {
  const { renderMathExpression: renderMath, buildArticleStructuredData, mapNotionPage } = loadCommonJsModule("js/notion-content.js");
  assert.match(renderMath("\\frac12"), /<mfrac><mn>1<\/mn><mn>2<\/mn><\/mfrac>/);
  assert.match(renderMath("x^12"), /<msup><mi>x<\/mi><mn>1<\/mn><\/msup><mn>2<\/mn>/);
  assert.match(renderMath("x^{12}"), /<msup><mi>x<\/mi><mrow><mn>12<\/mn><\/mrow><\/msup>/);
  assert.match(renderMath("\\frac1a^2"), /<msup><mfrac><mn>1<\/mn><mi>a<\/mi><\/mfrac><mn>2<\/mn><\/msup>/);
  const mapped = mapNotionPage({
    id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", last_edited_time: "2026-09-12T00:00:00.000Z",
    properties: { Date: { id: "date", name: "Date", type: "date", date: { start: "2020-01-01" } } },
  });
  assert.equal(mapped.updatedAt, "2026-09-12T00:00:00.000Z");
  const structured = buildArticleStructuredData(mapped);
  assert.equal(structured.datePublished, "2020-01-01");
  assert.equal(structured.dateModified, "2026-09-12T00:00:00.000Z");
  assert.equal(buildArticleStructuredData({ date: "2020-01-01" }).dateModified, undefined);
  assert.equal(mapNotionPage({ id: "x", last_edited_time: "invalid" }).updatedAt, "");
}

function checkIndependentBootRecovery() {
  const body = new FakeElement();
  body.dataset.page = "blog";
  const timers = new Set();
  const listeners = new Map();
  let reloads = 0;
  const guard = loadBrowserScript("js/boot-guard.js", {
    window: {
      location: { reload: () => { reloads += 1; } },
      addEventListener: (event, handler) => listeners.set(event, handler),
      removeEventListener: (event) => listeners.delete(event),
    },
    document: {
      body,
      createElement: () => {
        const element = new FakeElement();
        Object.defineProperty(element, "firstElementChild", { get: () => element.children[0] });
        element.remove = () => { body.children = body.children.filter((child) => child !== element); };
        return element;
      },
    },
    globals: {
      setTimeout: (callback) => { timers.add(callback); return callback; },
      clearTimeout: (callback) => timers.delete(callback),
    },
  });
  assert.equal(body.children.length, 0, "successful startup must not flash error UI");
  listeners.get("error")({ target: { hasAttribute: (name) => name === "data-spa-runtime" } });
  assert.equal(body.children.length, 1, "a module graph failure needs recovery without runtime-core");
  assert.equal(body.dataset.pageModuleError, "blog");
  assert.equal(timers.size, 0);
  body.children[0].children[1].dispatch("click");
  assert.equal(reloads, 1, "recovery must use a fresh document, not a cached rejected import");
  guard.window.AppBoot.complete();
  assert.equal(body.children.length, 0);
  assert.equal(listeners.size, 0, "startup completion must detach the resource observer");
}

function checkFragmentResolution() {
  const location = new URL("https://example.com/blog.html#%E6%B5%8B%E8%AF%95");
  const calls = [];
  const runtime = loadBrowserScript("js/runtime-core.js", {
    window: { location },
    document: { getElementById: (id) => id === "测试" ? { scrollIntoView: () => calls.push(id) } : null },
  });
  assert.equal(runtime.window.scrollToPageFragment(), true);
  assert.deepEqual(calls, ["测试"]);
  for (const hash of ["#%ZZ", "#missing", ""]) {
    location.hash = hash;
    assert.equal(runtime.window.scrollToPageFragment(), false, "unresolved hashes must allow normal page scrolling");
  }
}

function checkBrandAndDeployment() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "share-reliability-"));
  try {
    for (const file of ["index.html", "blog.html", "post.html", "manifest.webmanifest", "site.config.json", "favicon.png", "og-image.jpg"]) {
      fs.copyFileSync(path.join(root, file), path.join(fixture, file));
    }
    for (const directory of ["js", "css", "assets"]) fs.cpSync(path.join(root, directory), path.join(fixture, directory), { recursive: true });
    const config = JSON.parse(read("site.config.json"));
    for (const siteName of ["Share Everything", "审计品牌", 'A&B <博客> "分享"', "😀".repeat(13)]) {
      fs.writeFileSync(path.join(fixture, "site.config.json"), JSON.stringify({ ...config, siteName }));
      execFileSync(process.execPath, [path.join(root, "scripts/inject-site-meta.mjs")], { cwd: fixture, stdio: "pipe", timeout: 10_000 });
      checkSiteBrand({
        siteName,
        indexHtml: fs.readFileSync(path.join(fixture, "index.html"), "utf8"),
        blogHtml: fs.readFileSync(path.join(fixture, "blog.html"), "utf8"),
        postHtml: fs.readFileSync(path.join(fixture, "post.html"), "utf8"),
        manifest: JSON.parse(fs.readFileSync(path.join(fixture, "manifest.webmanifest"), "utf8")),
      });
    }
    assert.equal(readShortSiteName("😀".repeat(13)), "😀".repeat(12), "short name must not split surrogate pairs");
    const appFile = path.join(fixture, "js/app.js");
    fs.writeFileSync(appFile, replaceAssetVersionTokens(fs.readFileSync(appFile, "utf8"), computeExpectedAssetVersion(fixture)));
    fs.mkdirSync(path.join(fixture, "dist"));
    fs.writeFileSync(path.join(fixture, "dist", "stale-secret.txt"), "fixture");
    fs.mkdirSync(path.join(fixture, "server"));
    fs.writeFileSync(path.join(fixture, "server", "private.js"), "fixture");
    const output = buildStaticSite(fixture);
    assert.ok(output.files.includes("js/boot-guard.js") || output.files.includes(path.join("js", "boot-guard.js")));
    for (const privatePath of ["stale-secret.txt", "server", "scripts", "site.config.json", "post.html", "package.json"]) {
      assert.equal(fs.existsSync(path.join(output.destination, privatePath)), false, `${privatePath} must not be published as static content`);
    }
    assert.equal(fs.existsSync(path.join(fixture, "server/private.js")), true, "function build dependencies must remain intact");
    const vercel = JSON.parse(read("vercel.json"));
    assert.equal(vercel.outputDirectory, "dist");
    assert.equal(vercel.buildCommand, "npm run build");
    assert.equal(vercel.functions["api/post.js"].includeFiles, "post.html", "SSR must retain its private template");
  } finally {
    const resolved = fs.realpathSync(fixture);
    assert.equal(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith("share-reliability-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

export async function runReliabilityRegressionChecks() {
  const native = execFileSync(process.execPath, [path.join(root, "scripts/fixtures/cover-lifecycle-probe.mjs")], {
    cwd: root, encoding: "utf8", timeout: 20_000, windowsHide: true,
  });
  assert.equal(JSON.parse(native).length, 4, "real Sharp lifecycle checks must finish without process-level errors");
  await checkConcurrentQueries();
  await checkNavigationCancellation();
  checkContentSemantics();
  checkIndependentBootRecovery();
  checkFragmentResolution();
  checkBrandAndDeployment();
  console.log("Reliability regressions passed (native cancellation, query sharing, navigation, math, metadata, branding, static output).");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runReliabilityRegressionChecks();
}
