import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import sharp from "sharp";
import { createApiResponseRecorder, loadCommonJsModule } from "../smoke-check/harness.mjs";

const require = createRequire(import.meta.url);
const imageProxy = require("../../server/image-proxy.js");
const body = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#123456" } }).png().toBuffer();
const results = [];
for (const format of ["webp", "avif"]) {
  for (const cancellation of ["client", "timeout"]) {
    let nativeStarted;
    let releaseCompletion;
    let nativeCompleted = 0;
    let timeoutSeconds = 0;
    let lifecycleCount = 0;
    const started = new Promise((resolve) => { nativeStarted = resolve; });
    const completionBarrier = new Promise((resolve) => { releaseCompletion = resolve; });
    function observedSharp(...args) {
      const pipeline = sharp(...args);
      const toBuffer = pipeline.toBuffer.bind(pipeline);
      const timeout = pipeline.timeout.bind(pipeline);
      pipeline.timeout = (options) => { timeoutSeconds = options.seconds; return timeout(options); };
      pipeline.toBuffer = () => {
        const task = toBuffer();
        nativeStarted();
        return task.then(async (buffer) => {
          nativeCompleted += 1;
          // Hold completion so capacity assertions do not depend on CPU speed.
          await completionBarrier;
          return buffer;
        });
      };
      return pipeline;
    }
    observedSharp.strategy = sharp.strategy;
    const handler = loadCommonJsModule("api/cover.js", [], {
      __moduleMocks: {
        sharp: observedSharp,
        "../server/image-proxy": {
          ...imageProxy,
          IMAGE_PROXY_TIMEOUT_MS: 5_000,
          normalizeSourceUrl: async (source) => new URL(source),
          fetchImageResponse: async () => new Response(body, { headers: { "content-type": "image/png" } }),
          readBoundedImageBuffer: async () => body,
        },
        "../server/request-lifecycle": {
          ...require("../../server/request-lifecycle.js"),
          createRequestLifecycle(req, res, options) {
            lifecycleCount += 1;
            return require("../../server/request-lifecycle.js").createRequestLifecycle(req, res, {
              ...options, timeoutMs: cancellation === "timeout" && lifecycleCount <= 2 ? 30 : 5_000,
            });
          },
        },
        "../server/image-source-policy": {
          IMAGE_PROXY_SIGNATURE_PARAMETER: "sig",
          authorizeImageSourceQuery: (query) => ({ ok: true, source: query.src }),
        },
        "../server/request-guard": {
          ...require("../../server/request-guard.js"),
          readPositiveIntegerEnv: (key, fallback) => ["COVER_IMAGE_MAX_CONCURRENT_REQUESTS", "COVER_IMAGE_MAX_QUEUED_REQUESTS"].includes(key) ? 1 : fallback,
        },
      },
    });
    function request() {
      const query = { format, src: "https://assets.example.com/cover.png", sig: "fixture", w: "960" };
      const req = Object.assign(new EventEmitter(), { method: "GET", query, url: `/api/cover?${new URLSearchParams(query)}` });
      const res = Object.assign(new EventEmitter(), createApiResponseRecorder());
      return { req, res };
    }
    const first = request();
    let handlerSettled = false;
    const pending = handler(first.req, first.res).finally(() => { handlerSettled = true; });
    await started;
    if (cancellation === "client") first.req.emit("aborted");
    else {
      const deadline = Date.now() + 2_000;
      while (!first.res.ended && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal(first.res.statusCode, 504, "deadline must send 504 before native completion");
      assert.equal(first.res.ended, true);
    }
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(handlerSettled, false, "native work must retain its invocation and capacity");
    const busy = request();
    const queued = handler(busy.req, busy.res);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(busy.res.ended, false, "a normal burst must queue behind native work");
    const overflow = request();
    await handler(overflow.req, overflow.res);
    assert.equal(overflow.res.statusCode, 503, "native work and queued requests must both count against capacity");
    if (cancellation === "client") busy.req.emit("aborted");
    await queued;
    assert.equal(busy.req.listenerCount("aborted"), 0);
    assert.equal(busy.res.listenerCount("close"), 0);
    if (cancellation === "timeout") assert.equal(busy.res.statusCode, 504, "queue time must count against the total request budget");
    else assert.equal(busy.res.headersSent, false, "cancelled queued work must not write a response");
    assert.equal(handlerSettled, false, "cancelling a queued request must not release active native work");
    const successor = request();
    const successorTask = handler(successor.req, successor.res);
    releaseCompletion();
    await Promise.all([pending, successorTask]);
    assert.equal(successor.res.statusCode, 200, "cancellation must free queue capacity for a replacement reader");
    assert.equal(nativeCompleted, 2, "cancelled queued requests must never start native conversion");
    assert.equal(first.req.listenerCount("aborted"), 0);
    assert.equal(first.res.listenerCount("close"), 0);
    if (cancellation === "client") assert.equal(first.res.headersSent, false);
    assert.ok(timeoutSeconds > 0 && timeoutSeconds <= 5, "native processing must retain a finite budget");
    const recovered = request();
    await handler(recovered.req, recovered.res);
    assert.equal(recovered.res.statusCode, 200, "capacity must be released after native settlement");
    assert.equal((await sharp(recovered.res.textBody).metadata()).format, format === "avif" ? "heif" : format);
    results.push({ format, cancellation, status: "passed" });
  }
}
// No uncaughtException/unhandledRejection handlers: either error fails this process.
console.log(JSON.stringify(results));
