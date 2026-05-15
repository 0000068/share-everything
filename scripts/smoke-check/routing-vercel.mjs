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
expectIncludes(apiRobotsJs, "getSiteOrigin", "dynamic robots should use the configured site origin");
expectIncludes(apiRobotsJs, "Sitemap:", "dynamic robots should emit a sitemap directive");
expectIncludes(vercelJson, '"/posts/:id"', "Vercel should rewrite canonical article routes");
expectIncludes(vercelJson, '"/robots.txt"', "Vercel should serve a dynamic robots.txt");
expectIncludes(vercelJson, '"/sitemap.xml"', "Vercel should serve a dynamic sitemap");
expectIncludes(vercelJson, '"/favicon.png"', "Vercel should set cache headers for the approved brand favicon asset");
expectIncludes(vercelJson, '"/manifest.webmanifest"', "Vercel should set revalidation headers for the standalone web manifest");
expectIncludes(vercelJson, '"/og-image.jpg"', "Vercel should set cache headers for the Open Graph image asset");
expectNotIncludes(vercelJson, '"/favicon.svg"', "Vercel should not preserve a cache rule for the removed SVG favicon");
expectIncludes(vercelJson, "max-age=3600, stale-while-revalidate=86400", "Vercel should give versioned static scripts and styles a short browser cache");
const parsedVercelJson = JSON.parse(vercelJson);
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
