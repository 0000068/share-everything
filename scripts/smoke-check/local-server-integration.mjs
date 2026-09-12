import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const host = "127.0.0.1";

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, host, () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function request(origin, pathname, { method = "GET", timeoutMs = 3_000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(origin, { path: pathname, method }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.once("end", () => resolve({
        body: Buffer.concat(chunks),
        headers: res.headers,
        statusCode: res.statusCode || 0,
      }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out requesting ${pathname}`)));
    req.once("error", reject);
    req.end();
  });
}

function requestBeforeBodyCompletion(origin, pathname, { timeoutMs = 1_500 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${origin}${pathname}`, {
      method: "POST",
      headers: {
        "Content-Length": String(100 * 1024 * 1024),
        "Content-Type": "application/octet-stream",
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.once("end", () => {
        clearTimeout(timer);
        req.destroy();
        resolve({
          body: Buffer.concat(chunks),
          headers: res.headers,
          statusCode: res.statusCode || 0,
        });
      });
    });
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error("Read-only API waited for an incomplete request body"));
    }, timeoutMs);
    req.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    req.write(Buffer.alloc(1_024));
  });
}

async function waitForLifecycleProbe(origin) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const response = await request(origin, "/api/__lifecycle-probe?read=1");
    const payload = JSON.parse(response.body.toString("utf8"));
    if (payload.ready) return payload;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Local server lifecycle probe did not settle");
}

async function waitForServer(origin, child, getOutput) {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Local server exited before it became ready (${child.exitCode})\n${getOutput()}`);
    }
    try {
      const response = await request(origin, "/", { timeoutMs: 750 });
      if (response.statusCode === 200) return response;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`Local server did not become ready: ${lastError?.message || "unknown error"}\n${getOutput()}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const stopped = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  const timer = setTimeout(() => child.kill("SIGKILL"), 3_000);
  await stopped;
  clearTimeout(timer);
}

export async function runLocalServerIntegrationChecks({ assert }) {
  const port = await reservePort();
  const origin = `http://${host}:${port}`;
  const child = spawn(process.execPath, ["scripts/local-server.mjs"], {
    cwd: rootDir,
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port),
      LOCAL_SERVER_LIFECYCLE_PROBE: "1",
      VISUAL_REGRESSION_STATIC_TEMPLATES: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  try {
    const indexResponse = await waitForServer(origin, child, () => output.trim());
    assert.match(indexResponse.body.toString("utf8"), /<!doctype html>/i, "local server should serve the real home document");

    const malformedResponse = await request(origin, "//[");
    assert.equal(malformedResponse.statusCode, 400, "malformed request targets must return 400");
    assert.equal((await request(origin, "/")).statusCode, 200, "malformed URLs must not kill the server");

    const cssHeadResponse = await request(origin, "/css/style.css", { method: "HEAD" });
    assert.equal(cssHeadResponse.statusCode, 200, "local server should serve static HEAD requests");
    assert.equal(cssHeadResponse.body.length, 0, "static HEAD responses should not include a body");
    assert.match(String(cssHeadResponse.headers["content-type"]), /^text\/css\b/, "local server should send the CSS media type");

    const visualTemplateResponse = await request(origin, "/__visual/post.html");
    assert.equal(visualTemplateResponse.statusCode, 200, "visual fixtures should be available only when explicitly enabled");

    const robotsResponse = await request(origin, "/robots.txt");
    assert.equal(robotsResponse.statusCode, 200, "local server should map robots.txt to the real API handler");
    assert.match(robotsResponse.body.toString("utf8"), /^User-agent:/, "local robots response should contain crawler policy");

    const lifecycleStartResponse = await request(origin, "/api/__lifecycle-probe");
    assert.equal(lifecycleStartResponse.statusCode, 200, "local lifecycle probe should complete a normal API response");
    const lifecycleResult = await waitForLifecycleProbe(origin);
    assert.equal(lifecycleResult.writableEnded, true, "response shim should expose the underlying writableEnded state");
    assert.equal(lifecycleResult.finished, true, "response shim should expose the underlying finished state");
    assert.equal(lifecycleResult.completionAborted, false, "normal response close must not abort its request lifecycle");
    assert.equal(lifecycleResult.completionAbortKind, "", "normal response completion must not be classified as a client disconnect");
    assert.equal(lifecycleResult.disposableAborted, false, "disposing a request lifecycle must not abort it");
    assert.equal(
      lifecycleResult.closeListenersAfterDispose,
      lifecycleResult.closeListenersBeforeDispose - 1,
      "response shim removeListener should detach the lifecycle close listener",
    );
    assert.equal(
      lifecycleResult.closeListenersAfterCompletionDispose,
      0,
      "completed request lifecycle should leave no response close listeners behind",
    );

    const nonCanonicalPostsResponse = await request(
      origin,
      "/api/posts-data?search=quality&category=engineering",
    );
    assert.equal(
      nonCanonicalPostsResponse.statusCode,
      400,
      "local API routing should preserve the raw URL so canonical query ordering matches deployment",
    );

    const oversizedPostResponse = await requestBeforeBodyCompletion(origin, "/api/posts-data");
    assert.equal(
      oversizedPostResponse.statusCode,
      405,
      "read-only API method guards should respond before an oversized request body completes",
    );

    const deniedResponse = await request(origin, "/server/notion-client.js");
    assert.equal(deniedResponse.statusCode, 403, "local server should deny private source roots");

    const canonicalPostId = "123456781234123412341234567890ab";
    const noisyPostResponse = await request(origin, `/posts/${canonicalPostId}?tracking=1`);
    assert.equal(noisyPostResponse.statusCode, 308, "local post routing should remove non-canonical query noise");
    assert.equal(
      noisyPostResponse.headers.location,
      `/posts/${canonicalPostId}`,
      "local post redirects should preserve the path id and drop extra query keys",
    );

    const nestedPostResponse = await request(origin, "/posts/123456781234123412341234567890ab/extra");
    assert.equal(nestedPostResponse.statusCode, 404, "local server should reject non-canonical nested post routes");
  } finally {
    await stopServer(child);
  }
}
