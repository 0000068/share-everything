export async function runRoutingAndVercelChecks(context) {
  const {
    assert,
    apiNotionHandler,
    apiNotionJs,
    apiSitemapJs,
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
expectIncludes(apiSitemapJs, '"Cache-Control", "no-store"', "dynamic sitemap should not outlive public access changes");
expectIncludes(vercelJson, '"/posts/:id"', "Vercel should rewrite canonical article routes");
expectIncludes(vercelJson, '"/sitemap.xml"', "Vercel should serve a dynamic sitemap");
expectIncludes(vercelJson, '"/favicon.png"', "Vercel should set cache headers for the real favicon asset");
expectIncludes(vercelJson, "max-age=3600, stale-while-revalidate=86400", "Vercel should give versioned static scripts and styles a short browser cache");
const parsedVercelJson = JSON.parse(vercelJson);
const rootHeaderRule = parsedVercelJson.headers.find((entry) => entry.source === "/");
assert.ok(
  rootHeaderRule?.headers?.some((header) => header.key === "Cache-Control" && header.value === "public, max-age=0, must-revalidate"),
  "Vercel should explicitly give the root route the same revalidation policy as static HTML files",
);
const apiHeaderRule = parsedVercelJson.headers.find((entry) => entry.source === "/api/(.*)");
assert.ok(
  !apiHeaderRule?.headers?.some((header) => String(header.key).toLowerCase() === "cache-control"),
  "Vercel should leave API Cache-Control decisions to individual handlers so /api/image can be edge-cacheable",
);
expectIncludes(vercelJson, "frame-ancestors 'none'", "Vercel global CSP should preserve clickjacking protection");
expectIncludes(vercelJson, '"X-Frame-Options"', "Vercel should retain legacy frame-denial protection");
expectNotIncludes(vercelJson, "script-src-elem 'self' 'unsafe-inline'", "Vercel global CSP should not allow arbitrary inline script elements");
expectNotIncludes(vercelJson, "default-src 'self'; script-src", "Vercel global CSP should leave script policy to static meta tags and SSR nonce headers");
expectNotIncludes(vercelJson, '"/api/:path*"', "Vercel should not rewrite semantic API routes through the disabled legacy proxy");


}
