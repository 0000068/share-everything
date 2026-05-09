export async function runImageProxyChecks(context) {
  const {
    assert,
    Buffer,
    apiImageHandler,
    apiImageJs,
    createApiResponseRecorder,
    createImageRequestMock,
    expectIncludes,
    imageProxyDefaultConfig,
    loadCommonJsModule,
    publicImageDnsLookup,
    withEnvOverrides,
  } = context;

expectIncludes(apiImageJs, "IMAGE_PROXY_MAX_BYTES", "image proxy endpoint should bound upstream image size");
expectIncludes(apiImageJs, "isBlockedImageHost", "image proxy endpoint should reject local and private upstream hosts");
expectIncludes(apiImageJs, "resolvePublicImageHost", "image proxy endpoint should reject hosts that resolve to private addresses");
expectIncludes(apiImageJs, "__IMAGE_PROXY_HTTPS_REQUEST__", "image proxy endpoint should bind checked DNS answers to the upstream request");
expectIncludes(apiImageJs, "lookup(hostname, options, callback)", "image proxy endpoint should use a pinned lookup for the validated upstream host");
expectIncludes(apiImageJs, "BLOCKED_IMAGE_CONTENT_TYPES", "image proxy endpoint should reject active image formats such as SVG");
expectIncludes(apiImageJs, "X-Content-Type-Options", "image proxy endpoint should prevent content-type sniffing");
assert.equal(
  JSON.stringify(imageProxyDefaultConfig),
  JSON.stringify({
    IMAGE_PROXY_TIMEOUT_MS: 10_000,
    IMAGE_PROXY_MAX_BYTES: 8 * 1024 * 1024,
    IMAGE_PROXY_MAX_REDIRECTS: 4,
  }),
  "image proxy endpoint should preserve the documented default limits",
);
const imageProxyTunedConfig = withEnvOverrides({
  IMAGE_PROXY_TIMEOUT_MS: "2500",
  IMAGE_PROXY_MAX_BYTES: "1048576",
  IMAGE_PROXY_MAX_REDIRECTS: "1",
}, () => loadCommonJsModule("api/image.js", [
  "IMAGE_PROXY_TIMEOUT_MS",
  "IMAGE_PROXY_MAX_BYTES",
  "IMAGE_PROXY_MAX_REDIRECTS",
]).__test);
assert.equal(
  JSON.stringify(imageProxyTunedConfig),
  JSON.stringify({
    IMAGE_PROXY_TIMEOUT_MS: 2500,
    IMAGE_PROXY_MAX_BYTES: 1048576,
    IMAGE_PROXY_MAX_REDIRECTS: 1,
  }),
  "image proxy endpoint should allow deployment-specific limit tuning through env vars",
);
const imageProxyInvalidEnvConfig = withEnvOverrides({
  IMAGE_PROXY_TIMEOUT_MS: "0",
  IMAGE_PROXY_MAX_BYTES: "-1",
  IMAGE_PROXY_MAX_REDIRECTS: "-1",
}, () => loadCommonJsModule("api/image.js", [
  "IMAGE_PROXY_TIMEOUT_MS",
  "IMAGE_PROXY_MAX_BYTES",
  "IMAGE_PROXY_MAX_REDIRECTS",
]).__test);
assert.equal(
  JSON.stringify(imageProxyInvalidEnvConfig),
  JSON.stringify(imageProxyDefaultConfig),
  "image proxy endpoint should fall back to safe defaults for invalid env limits",
);
let imageProxyFetchUrl = "";
let imageProxyLookupAddress = "";
const fakeImageBody = Buffer.from("png");
const successfulImageProxyHandler = loadCommonJsModule("api/image.js", [], {
  __IMAGE_PROXY_DNS_LOOKUP__: publicImageDnsLookup,
  __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
    body: fakeImageBody,
    headers: {
      "content-type": "image/png",
      "content-length": String(fakeImageBody.byteLength),
    },
    onRequest(url, options) {
      imageProxyFetchUrl = String(url);
      assert.equal(typeof options.lookup, "function", "image proxy endpoint should pin the validated DNS address");
      options.lookup("assets.example.com", {}, (error, address, family) => {
        assert.equal(error, null);
        imageProxyLookupAddress = address;
        assert.equal(family, 4, "image proxy endpoint should preserve the resolved IP family");
      });
    },
  }),
});
const imageProxySuccessRes = createApiResponseRecorder();
await successfulImageProxyHandler({
  method: "GET",
  query: { src: "https://assets.example.com/cover.png" },
}, imageProxySuccessRes);
assert.equal(imageProxySuccessRes.statusCode, 200, "image proxy endpoint should return proxied images");
assert.equal(imageProxyFetchUrl, "https://assets.example.com/cover.png", "image proxy endpoint should fetch the normalized upstream image URL");
assert.equal(imageProxyLookupAddress, "93.184.216.34", "image proxy endpoint should connect to the DNS answer it already validated");
assert.equal(imageProxySuccessRes.getHeader("content-type"), "image/png", "image proxy endpoint should preserve upstream image content type");
assert.ok(
  imageProxySuccessRes.getHeader("cache-control")?.includes("s-maxage=604800"),
  "image proxy endpoint should make successful images edge-cacheable",
);
assert.ok(Buffer.isBuffer(imageProxySuccessRes.textBody), "image proxy endpoint should send a binary image buffer");
const svgImageProxyHandler = loadCommonJsModule("api/image.js", [], {
  __IMAGE_PROXY_DNS_LOOKUP__: publicImageDnsLookup,
  __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
    body: Buffer.from("<svg></svg>"),
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "content-length": "11",
    },
  }),
});
const imageProxySvgRes = createApiResponseRecorder();
await svgImageProxyHandler({
  method: "GET",
  query: { src: "https://assets.example.com/active.svg" },
}, imageProxySvgRes);
assert.equal(imageProxySvgRes.statusCode, 415, "image proxy endpoint should reject active SVG images");
assert.equal(imageProxySvgRes.getHeader("cache-control"), "no-store", "rejected SVG proxy responses should not be cached");
let blockedImageProxyFetchCount = 0;
const blockedImageProxyHandler = loadCommonJsModule("api/image.js", [], {
  __IMAGE_PROXY_DNS_LOOKUP__: publicImageDnsLookup,
  __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
    onRequest() {
      blockedImageProxyFetchCount += 1;
      throw new Error("Blocked image URL should not be fetched");
    },
  }),
});
const imageProxyBlockedRes = createApiResponseRecorder();
await blockedImageProxyHandler({
  method: "GET",
  query: { src: "https://127.0.0.1/private.png" },
}, imageProxyBlockedRes);
assert.equal(imageProxyBlockedRes.statusCode, 400, "image proxy endpoint should reject private upstream hosts");
assert.equal(blockedImageProxyFetchCount, 0, "image proxy endpoint should reject private hosts before fetching");
const imageProxyBlockedIpv6Res = createApiResponseRecorder();
await blockedImageProxyHandler({
  method: "GET",
  query: { src: "https://[::1]/private.png" },
}, imageProxyBlockedIpv6Res);
assert.equal(imageProxyBlockedIpv6Res.statusCode, 400, "image proxy endpoint should reject IPv6 loopback upstream hosts");
assert.equal(blockedImageProxyFetchCount, 0, "image proxy endpoint should reject blocked IPv6 hosts before fetching");
const imageProxyBlockedMappedIpv6Res = createApiResponseRecorder();
await blockedImageProxyHandler({
  method: "GET",
  query: { src: "https://[::ffff:127.0.0.1]/private.png" },
}, imageProxyBlockedMappedIpv6Res);
assert.equal(imageProxyBlockedMappedIpv6Res.statusCode, 400, "image proxy endpoint should reject IPv4-mapped IPv6 upstream hosts");
assert.equal(blockedImageProxyFetchCount, 0, "image proxy endpoint should reject blocked IPv4-mapped IPv6 hosts before fetching");
const dnsBlockedImageProxyHandler = loadCommonJsModule("api/image.js", [], {
  __IMAGE_PROXY_DNS_LOOKUP__: async () => [{ address: "10.0.0.8", family: 4 }],
  __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
    onRequest() {
      throw new Error("DNS-blocked image URL should not be fetched");
    },
  }),
});
const imageProxyDnsBlockedRes = createApiResponseRecorder();
await dnsBlockedImageProxyHandler({
  method: "GET",
  query: { src: "https://assets.example.com/private.png" },
}, imageProxyDnsBlockedRes);
assert.equal(imageProxyDnsBlockedRes.statusCode, 400, "image proxy endpoint should reject upstream hosts whose DNS resolves to private addresses");
const mappedDnsBlockedImageProxyHandler = loadCommonJsModule("api/image.js", [], {
  __IMAGE_PROXY_DNS_LOOKUP__: async () => [{ address: "::ffff:10.0.0.8", family: 6 }],
  __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
    onRequest() {
      throw new Error("DNS-blocked IPv4-mapped image URL should not be fetched");
    },
  }),
});
const imageProxyMappedDnsBlockedRes = createApiResponseRecorder();
await mappedDnsBlockedImageProxyHandler({
  method: "GET",
  query: { src: "https://assets.example.com/private.png" },
}, imageProxyMappedDnsBlockedRes);
assert.equal(imageProxyMappedDnsBlockedRes.statusCode, 400, "image proxy endpoint should reject DNS answers with private IPv4 embedded in IPv6");
let redirectImageProxyFetchCount = 0;
const redirectBlockedImageProxyHandler = loadCommonJsModule("api/image.js", [], {
  __IMAGE_PROXY_DNS_LOOKUP__: publicImageDnsLookup,
  __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
    status: 302,
    headers: {
      location: "https://[::1]/private.png",
    },
    onRequest() {
      redirectImageProxyFetchCount += 1;
    },
  }),
});
const imageProxyRedirectBlockedRes = createApiResponseRecorder();
await redirectBlockedImageProxyHandler({
  method: "GET",
  query: { src: "https://assets.example.com/redirect.png" },
}, imageProxyRedirectBlockedRes);
assert.equal(imageProxyRedirectBlockedRes.statusCode, 400, "image proxy endpoint should reject redirects to blocked hosts");
assert.equal(redirectImageProxyFetchCount, 1, "image proxy endpoint should stop before fetching a blocked redirect target");
const imageProxyMethodRes = createApiResponseRecorder();
await apiImageHandler({ method: "POST", query: { src: "https://assets.example.com/cover.png" } }, imageProxyMethodRes);
assert.equal(imageProxyMethodRes.statusCode, 405, "image proxy endpoint should reject unsupported methods");

}
