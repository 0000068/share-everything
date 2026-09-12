export async function runRoutingAndVercelChecks(context) {
  const {
    assert,
    apiNotionHandler,
    apiNotionJs,
    apiRobotsHandler,
    apiRobotsJs,
    apiSitemapJs,
    configuredSiteOrigin,
    createApiResponseRecorder,
    expectIncludes,
    expectNotIncludes,
    loadCommonJsModule,
    vercelJson,
  } = context;

expectIncludes(apiNotionJs, "generic Notion proxy is disabled", "API proxy should be explicitly disabled");
assert.ok(
  !apiNotionJs.includes("Authorization: `Bearer"),
  "API proxy should not forward arbitrary authenticated Notion requests anymore",
);
assert.ok(
  !apiNotionJs.includes("Access-Control-Allow-Origin"),
  "disabled Notion proxy should not keep dead per-origin CORS response handling",
);
const disabledProxyResponse = createApiResponseRecorder();
await apiNotionHandler({ method: "GET", headers: {} }, disabledProxyResponse);
assert.equal(disabledProxyResponse.statusCode, 410, "disabled Notion proxy should return HTTP 410");
assert.equal(disabledProxyResponse.getHeader("cache-control"), "no-store", "disabled Notion proxy should mark responses as non-cacheable");
expectIncludes(apiSitemapJs, "buildPostUrl", "dynamic sitemap should include article routes");
expectIncludes(apiSitemapJs, "queryPublicPages", "dynamic sitemap should only include public posts");
expectIncludes(apiSitemapJs, "getPublicContentErrorStatus", "dynamic sitemap should reuse public content error status mapping");
expectIncludes(apiSitemapJs, "applyPublicErrorHeaders", "dynamic sitemap should preserve upstream retry guidance");
expectIncludes(apiSitemapJs, "serializePublicError", "dynamic sitemap should serialize upstream errors consistently");
expectIncludes(apiSitemapJs, "s-maxage=300", "dynamic sitemap should allow bounded CDN caching");
expectIncludes(apiSitemapJs, "createRequestLifecycle", "dynamic sitemap should own a cancellable request lifecycle");
expectIncludes(apiSitemapJs, "queryPublicPages({}, { signal: lifecycle.signal })", "dynamic sitemap should pass its lifecycle signal to the public page query");
expectIncludes(apiSitemapJs, 'lifecycle.abortKind === "client"', "dynamic sitemap should stop silently after a client disconnect");
expectIncludes(apiSitemapJs, "lifecycle.dispose()", "dynamic sitemap should always dispose request listeners");

function attachLifecycleEvents(target) {
  const listeners = new Map();
  target.once = function once(eventName, listener) {
    const normalizedEventName = String(eventName);
    const eventListeners = listeners.get(normalizedEventName) || new Set();
    eventListeners.add(listener);
    listeners.set(normalizedEventName, eventListeners);
    return this;
  };
  target.removeListener = function removeListener(eventName, listener) {
    const normalizedEventName = String(eventName);
    const eventListeners = listeners.get(normalizedEventName);
    eventListeners?.delete(listener);
    if (eventListeners?.size === 0) listeners.delete(normalizedEventName);
    return this;
  };
  target.listenerCount = (eventName) => listeners.get(String(eventName))?.size || 0;
  target.emit = function emit(eventName, ...args) {
    const normalizedEventName = String(eventName);
    const eventListeners = Array.from(listeners.get(normalizedEventName) || []);
    listeners.delete(normalizedEventName);
    eventListeners.forEach((listener) => listener(...args));
    return eventListeners.length > 0;
  };
  return target;
}

function createSitemapResponse() {
  const response = attachLifecycleEvents(createApiResponseRecorder());
  Object.defineProperties(response, {
    finished: { get: () => response.ended },
    writableEnded: { get: () => response.ended },
  });
  return response;
}

const sitemapQueryCalls = [];
let sitemapQueryMode = "pending";
let didObserveSitemapAbort = false;
const sitemapHandler = loadCommonJsModule("api/sitemap.js", [], {
  __moduleMocks: {
    "../server/notion-server": {
      buildPostUrl: (postId) => `${configuredSiteOrigin}/posts/${postId}`,
      getSiteOrigin: () => configuredSiteOrigin,
      queryPublicPages(query, { signal } = {}) {
        sitemapQueryCalls.push({ query, signal });
        if (sitemapQueryMode === "success") {
          return Promise.resolve([{
            id: "550e8400e29b41d4a716446655440000",
            date: "2026-07-17",
            updatedAt: "2026-09-12T00:00:00.000Z",
          }]);
        }

        return new Promise((_resolve, reject) => {
          const onAbort = () => {
            didObserveSitemapAbort = true;
            reject(signal.reason);
          };
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        });
      },
    },
  },
});

const disconnectedSitemapRequest = attachLifecycleEvents({ method: "GET", headers: {} });
const disconnectedSitemapResponse = createSitemapResponse();
const disconnectedSitemapResult = sitemapHandler(
  disconnectedSitemapRequest,
  disconnectedSitemapResponse,
);
await Promise.resolve();
assert.equal(sitemapQueryCalls.length, 1, "sitemap should begin exactly one public-page query");
assert.equal(
  JSON.stringify(sitemapQueryCalls[0].query),
  "{}",
  "sitemap should request the complete public page set",
);
assert.equal(
  typeof sitemapQueryCalls[0].signal?.addEventListener,
  "function",
  "sitemap should pass an AbortSignal to queryPublicPages",
);
assert.equal(disconnectedSitemapRequest.listenerCount("aborted"), 1, "sitemap should observe request aborts while work is pending");
assert.equal(disconnectedSitemapResponse.listenerCount("close"), 1, "sitemap should observe response closure while work is pending");
disconnectedSitemapRequest.emit("aborted");
assert.equal(await disconnectedSitemapResult, undefined, "a disconnected sitemap request should finish without a response payload");
assert.equal(sitemapQueryCalls[0].signal.aborted, true, "client disconnect should abort the public-page query signal");
assert.equal(didObserveSitemapAbort, true, "the pending public-page query should observe sitemap cancellation");
assert.equal(disconnectedSitemapResponse.headersSent, false, "a disconnected sitemap request must not write headers");
assert.equal(disconnectedSitemapResponse.ended, false, "a disconnected sitemap request must not end the response");
assert.equal(disconnectedSitemapRequest.listenerCount("aborted"), 0, "sitemap finally should remove the request abort listener");
assert.equal(disconnectedSitemapResponse.listenerCount("close"), 0, "sitemap finally should remove the response close listener");

sitemapQueryMode = "success";
const successfulSitemapRequest = attachLifecycleEvents({ method: "GET", headers: {} });
const successfulSitemapResponse = createSitemapResponse();
await sitemapHandler(successfulSitemapRequest, successfulSitemapResponse);
assert.equal(successfulSitemapResponse.statusCode, 200, "dynamic sitemap should return HTTP 200");
assert.ok(successfulSitemapResponse.textBody.includes("<lastmod>2026-09-12T00:00:00.000Z</lastmod>"));
assert.ok(!successfulSitemapResponse.textBody.includes("<lastmod>2026-07-17</lastmod>"), "sitemap must use modification time, not publication time");
assert.equal(successfulSitemapResponse.getHeader("content-type"), "application/xml; charset=utf-8", "dynamic sitemap should send XML");
assert.equal(
  successfulSitemapResponse.getHeader("cache-control"),
  "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
  "successful sitemap responses should retain bounded CDN caching",
);
expectIncludes(successfulSitemapResponse.textBody, `<loc>${configuredSiteOrigin}/</loc>`, "sitemap should retain the site root entry");
expectIncludes(
  successfulSitemapResponse.textBody,
  `<loc>${configuredSiteOrigin}/posts/550e8400e29b41d4a716446655440000</loc>`,
  "sitemap should retain public article entries",
);
assert.equal(sitemapQueryCalls[1].signal.aborted, false, "a completed sitemap query should not be marked aborted");
assert.equal(successfulSitemapRequest.listenerCount("aborted"), 0, "successful sitemap completion should remove the request listener");
assert.equal(successfulSitemapResponse.listenerCount("close"), 0, "successful sitemap completion should remove the response listener");
expectIncludes(apiRobotsJs, "getSiteOrigin", "dynamic robots should use the configured site origin");
expectIncludes(apiRobotsJs, "Sitemap:", "dynamic robots should emit a sitemap directive");
expectIncludes(vercelJson, '"/posts/:id"', "Vercel should rewrite canonical article routes");
expectIncludes(vercelJson, '"/robots.txt"', "Vercel should serve a dynamic robots.txt");
expectIncludes(vercelJson, '"/sitemap.xml"', "Vercel should serve a dynamic sitemap");
expectIncludes(vercelJson, '"/favicon.png"', "Vercel should set cache headers for the approved brand favicon asset");
expectIncludes(vercelJson, '"/manifest.webmanifest"', "Vercel should set revalidation headers for the standalone web manifest");
expectIncludes(vercelJson, '"/og-image.jpg"', "Vercel should set cache headers for the Open Graph image asset");
expectNotIncludes(vercelJson, '"/favicon.svg"', "Vercel should not preserve a cache rule for the removed SVG favicon");
expectIncludes(vercelJson, "public, max-age=31536000, immutable", "Vercel should give uniformly versioned static assets an immutable one-year cache");
const parsedVercelJson = JSON.parse(vercelJson);
for (const source of ["/css/(.*)", "/js/(.*)", "/assets/(.*)"]) {
  const rule = parsedVercelJson.headers.find((entry) => entry.source === source);
  assert.ok(
    rule?.headers?.some((header) => header.key === "Cache-Control" && header.value === "public, max-age=31536000, immutable"),
    `Vercel should apply the immutable cache contract to ${source}`,
  );
}
const rootHeaderRule = parsedVercelJson.headers.find((entry) => entry.source === "/");
assert.ok(
  rootHeaderRule?.headers?.some((header) => header.key === "Cache-Control" && header.value === "public, max-age=0, must-revalidate"),
  "Vercel should explicitly give the root route the same revalidation policy as static HTML files",
);
const manifestHeaderRule = parsedVercelJson.headers.find((entry) => entry.source === "/manifest.webmanifest");
assert.ok(
  manifestHeaderRule?.headers?.some((header) => header.key === "Cache-Control" && header.value === "public, max-age=0, must-revalidate"),
  "Vercel should revalidate the web manifest so standalone mobile metadata updates promptly",
);
const apiHeaderRule = parsedVercelJson.headers.find((entry) => entry.source === "/api/(.*)");
assert.ok(
  !apiHeaderRule?.headers?.some((header) => String(header.key).toLowerCase() === "cache-control"),
  "Vercel should leave API Cache-Control decisions to individual handlers so /api/image can be edge-cacheable",
);
const globalHeaderRule = parsedVercelJson.headers.find((entry) => entry.source === "/(.*)");
expectIncludes(vercelJson, "frame-ancestors 'none'", "Vercel global CSP should preserve clickjacking protection");
expectIncludes(vercelJson, '"X-Frame-Options"', "Vercel should retain legacy frame-denial protection");
assert.ok(
  globalHeaderRule?.headers?.some((header) => header.key === "Strict-Transport-Security" && header.value === "max-age=31536000; includeSubDomains"),
  "Vercel should emit HSTS on all routes",
);
assert.ok(
  globalHeaderRule?.headers?.some((header) => header.key === "Referrer-Policy" && header.value === "strict-origin-when-cross-origin"),
  "Vercel should emit a strict referrer policy on all routes",
);
assert.ok(
  globalHeaderRule?.headers?.some((header) => header.key === "Permissions-Policy" && header.value === "camera=(), microphone=(), geolocation=()"),
  "Vercel should deny unused powerful browser features on all routes",
);
expectNotIncludes(vercelJson, "script-src-elem 'self' 'unsafe-inline'", "Vercel global CSP should not allow arbitrary inline script elements");
expectNotIncludes(vercelJson, "default-src 'self'; script-src", "Vercel global CSP should leave script policy to static meta tags and SSR nonce headers");
expectNotIncludes(vercelJson, '"/api/:path*"', "Vercel should not rewrite semantic API routes through the disabled legacy proxy");

const robotsResponse = createApiResponseRecorder();
await apiRobotsHandler({ method: "GET", headers: {} }, robotsResponse);
assert.equal(robotsResponse.statusCode, 200, "dynamic robots should return HTTP 200");
assert.equal(robotsResponse.getHeader("content-type"), "text/plain; charset=utf-8", "dynamic robots should send text/plain");
assert.equal(
  robotsResponse.getHeader("cache-control"),
  "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
  "dynamic robots should allow CDN caching while forcing browser revalidation",
);
expectIncludes(robotsResponse.textBody, "User-agent: *", "dynamic robots should include a user-agent directive");
expectIncludes(
  robotsResponse.textBody,
  `Sitemap: ${configuredSiteOrigin}/sitemap.xml`,
  "dynamic robots sitemap URL should follow site.config.json",
);

const robotsPostResponse = createApiResponseRecorder();
await apiRobotsHandler({ method: "POST", headers: {} }, robotsPostResponse);
assert.equal(robotsPostResponse.statusCode, 405, "dynamic robots should reject unsupported methods with HTTP 405");
assert.equal(robotsPostResponse.getHeader("allow"), "GET, HEAD", "dynamic robots should advertise the supported read methods");
assert.equal(robotsPostResponse.getHeader("cache-control"), "no-store", "dynamic robots 405 responses should be non-cacheable");


}
