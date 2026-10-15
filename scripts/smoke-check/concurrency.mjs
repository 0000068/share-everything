import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import sharp from "sharp";
import { createApiResponseRecorder, loadCommonJsModule } from "./harness.mjs";

const require = createRequire(import.meta.url);
const { createAsyncLimiter } = require("../../server/notion-config.js");
const { createConcurrencyGate } = require("../../server/request-guard.js");
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function checkLimiterHandoff() {
  for (const limit of [1, 4]) {
    const run = createAsyncLimiter(limit);
    let active = 0;
    let peak = 0;
    let release;
    const barrier = new Promise((resolve) => { release = resolve; });
    const started = [];
    const hold = async (id) => {
      active += 1;
      peak = Math.max(peak, active);
      started.push(id);
      await barrier;
      active -= 1;
      return id;
    };
    const first = run(async () => {});
    const occupied = Array.from({ length: limit - 1 }, (_, index) => run(() => hold(index)));
    const queued = run(() => hold("queued"));
    // This arrives after the first task completes but before the queued task's
    // continuation runs. The queued task must already own the released slot.
    const newcomer = Promise.resolve().then(() => run(() => hold("newcomer")));
    await tick();
    release();
    await Promise.all([first, ...occupied, queued, newcomer]);
    assert.equal(peak, limit, "handoff must reserve the permit before waking a queued caller");
    assert.ok(started.indexOf("queued") < started.indexOf("newcomer"), "new arrivals must not bypass the queue");
    await assert.rejects(run(() => { throw new Error("task failed"); }), /task failed/);
    assert.equal(await run(() => 42), 42, "task errors must release their permit");
  }
}

async function checkBoundedGate() {
  const gate = createConcurrencyGate(1, { maxQueued: 2 });
  const first = gate.tryAcquire();
  const abandoned = new AbortController();
  const waiting = gate.acquire({ signal: abandoned.signal });
  const survivor = gate.acquire();
  assert.equal(gate.activeCount, 1);
  assert.equal(gate.queuedCount, 2);
  assert.equal(await gate.acquire(), null, "queue overflow must fail without growing the queue");
  const reason = new Error("reader left");
  abandoned.abort(reason);
  await assert.rejects(waiting, (error) => error === reason);
  assert.equal(gate.queuedCount, 1, "cancelled work must be removed from the queue immediately");
  await assert.rejects(gate.acquire({ signal: abandoned.signal }), (error) => error === reason);
  assert.equal(gate.queuedCount, 1, "already-aborted requests must not consume queue capacity");
  first();
  first();
  assert.equal(gate.tryAcquire(), null, "handoff must reserve capacity and release must be idempotent");
  const releaseSurvivor = await survivor;
  assert.equal(gate.queuedCount, 0);
  releaseSurvivor();
  releaseSurvivor();
  assert.equal(gate.activeCount, 0);
  const immediate = createConcurrencyGate(1);
  immediate.tryAcquire();
  assert.equal(await immediate.acquire(), null, "the default gate must retain its no-queue policy");
}

async function checkCoverBurst() {
  const imageProxy = require("../../server/image-proxy.js");
  const body = await sharp({ create: { width: 32, height: 18, channels: 3, background: "#123456" } }).png().toBuffer();
  let release;
  let ready;
  let active = 0;
  let peak = 0;
  let loads = 0;
  const barrier = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { ready = resolve; });
  const handler = loadCommonJsModule("api/cover.js", [], {
    __moduleMocks: {
      "../server/image-proxy": {
        ...imageProxy,
        IMAGE_PROXY_TIMEOUT_MS: 5_000,
        normalizeSourceUrl: async (source) => new URL(source),
        fetchImageResponse: async () => {
          active += 1;
          loads += 1;
          peak = Math.max(peak, active);
          if (loads === 2) ready();
          await barrier;
          active -= 1;
          return new Response(body, { headers: { "content-type": "image/png" } });
        },
        readBoundedImageBuffer: async () => body,
      },
      "../server/image-source-policy": {
        IMAGE_PROXY_SIGNATURE_PARAMETER: "sig",
        authorizeImageSourceQuery: (query) => ({ ok: true, source: query.src }),
      },
      "../server/request-guard": {
        ...require("../../server/request-guard.js"),
        readPositiveIntegerEnv: (_, fallback) => fallback,
      },
    },
  });
  const requests = Array.from({ length: 9 }, (_, index) => {
    const query = { format: "webp", src: `https://assets.example.com/${index}.png`, sig: "fixture", w: "320" };
    const req = Object.assign(new EventEmitter(), { method: "GET", query, url: `/api/cover?${new URLSearchParams(query)}` });
    const res = Object.assign(new EventEmitter(), createApiResponseRecorder());
    return { req, res, pending: handler(req, res) };
  });
  await started;
  await tick();
  assert.equal(loads, 2, "queued covers must not allocate upstream work before admission");
  release();
  await Promise.all(requests.map(({ pending }) => pending));
  assert.equal(peak, 2, "handling a whole page must retain the two-request resource limit");
  assert.equal(loads, 9);
  for (const { req, res } of requests) {
    assert.equal(res.statusCode, 200, "all nine first-page covers must succeed under the default limits");
    assert.equal((await sharp(res.textBody).metadata()).format, "webp");
    assert.equal(req.listenerCount("aborted"), 0);
    assert.equal(res.listenerCount("close"), 0);
  }
}

export async function runConcurrencyChecks() {
  await checkLimiterHandoff();
  await checkBoundedGate();
  await checkCoverBurst();
}
