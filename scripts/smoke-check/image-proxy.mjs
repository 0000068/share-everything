export async function runImageProxyChecks(context) {
  const {
    assert,
    Buffer,
    apiCoverHandler,
    apiCoverJs,
    apiImageHandler,
    apiImageJs,
    createApiResponseRecorder,
    createImageRequestMock,
    expectIncludes,
    expectNotIncludes,
    imageProxyDefaultConfig,
    loadCommonJsModule,
    publicImageDnsLookup,
    withEnvOverrides,
  } = context;

  const signingEnv = {
    IMAGE_PROXY_SIGNING_SECRET: "smoke-test-image-signing-secret-v1",
    NOTION_TOKEN: null,
  };
  const coverSourcePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMQqbgjUnGHAUIBACROBaFWe9NSAAAAAElFTkSuQmCC",
    "base64",
  );

  function loadSignedModule(relativePath, sandboxOverrides = {}, envOverrides = {}) {
    return withEnvOverrides({ ...signingEnv, ...envOverrides }, () => {
      const sourcePolicy = loadCommonJsModule("server/image-source-policy.js");
      return {
        handler: loadCommonJsModule(relativePath, [], sandboxOverrides),
        sign: sourcePolicy.createImageSourceSignature,
      };
    });
  }

  expectIncludes(apiCoverJs, "COVER_IMAGE_WIDTHS", "cover endpoint should constrain supported thumbnail widths");
  expectIncludes(apiCoverJs, "readAcceptedQuality", "cover endpoint should negotiate explicit Accept quality values");
  expectIncludes(apiCoverJs, "optimizeCoverImage", "cover endpoint should generate real resized image assets");
  expectIncludes(apiCoverJs, "sharp.strategy.attention", "cover endpoint should use content-aware crop positioning");
  expectIncludes(apiCoverJs, "../server/image-proxy", "cover endpoint should reuse the shared image fetch service");
  expectIncludes(apiImageJs, "../server/image-proxy", "image endpoint should delegate SSRF and upstream I/O to the shared service");
  expectIncludes(apiImageJs, "detectRasterImageMediaType", "image endpoint should validate raster magic bytes");
  expectIncludes(apiImageJs, "authorizeImageSourceQuery", "image endpoint should require server-issued source signatures");
  expectIncludes(apiImageJs, "createFixedWindowRateLimiter", "image endpoint should bound per-client origin work");
  expectNotIncludes(apiCoverJs, "imageProxyHandler.__internal", "cover endpoint should not depend on another API handler's internals");

  assert.deepEqual(
    { ...imageProxyDefaultConfig },
    {
      IMAGE_PROXY_TIMEOUT_MS: 10_000,
      IMAGE_PROXY_MAX_BYTES: 8 * 1024 * 1024,
      IMAGE_PROXY_MAX_REDIRECTS: 4,
    },
    "image proxy service should preserve the documented default limits",
  );
  const imageProxyTunedConfig = withEnvOverrides({
    IMAGE_PROXY_TIMEOUT_MS: "2500",
    IMAGE_PROXY_MAX_BYTES: "1048576",
    IMAGE_PROXY_MAX_REDIRECTS: "1",
  }, () => loadCommonJsModule("server/image-proxy.js", [
    "IMAGE_PROXY_TIMEOUT_MS",
    "IMAGE_PROXY_MAX_BYTES",
    "IMAGE_PROXY_MAX_REDIRECTS",
  ]).__test);
  assert.deepEqual(
    { ...imageProxyTunedConfig },
    {
      IMAGE_PROXY_TIMEOUT_MS: 2500,
      IMAGE_PROXY_MAX_BYTES: 1048576,
      IMAGE_PROXY_MAX_REDIRECTS: 1,
    },
    "image proxy service should allow deployment-specific limit tuning through env vars",
  );
  const imageProxyInvalidEnvConfig = withEnvOverrides({
    IMAGE_PROXY_TIMEOUT_MS: "0",
    IMAGE_PROXY_MAX_BYTES: "-1",
    IMAGE_PROXY_MAX_REDIRECTS: "-1",
  }, () => loadCommonJsModule("server/image-proxy.js", [
    "IMAGE_PROXY_TIMEOUT_MS",
    "IMAGE_PROXY_MAX_BYTES",
    "IMAGE_PROXY_MAX_REDIRECTS",
  ]).__test);
  assert.deepEqual(
    { ...imageProxyInvalidEnvConfig },
    { ...imageProxyDefaultConfig },
    "image proxy service should fall back to safe defaults for invalid env limits",
  );

  const imageFormatHelpers = loadCommonJsModule("server/image-format.js");
  assert.equal(imageFormatHelpers.detectRasterImageMediaType(coverSourcePng), "image/png");
  assert.equal(
    imageFormatHelpers.detectRasterImageMediaType(Buffer.from([0xff, 0xd8, 0xff, 0x00])),
    "image/jpeg",
  );
  assert.equal(
    imageFormatHelpers.detectRasterImageMediaType(Buffer.from([
      0x52, 0x49, 0x46, 0x46,
      0x0c, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x58,
    ])),
    "image/webp",
  );
  assert.equal(
    imageFormatHelpers.detectRasterImageMediaType(Buffer.from("BMnot-a-bitmap", "ascii")),
    "",
    "short BMP-like text should not pass raster validation",
  );
  assert.equal(
    imageFormatHelpers.normalizeDeclaredImageMediaType("image/apng"),
    "image/png",
    "safe raster aliases should normalize to the canonical response type",
  );
  assert.equal(
    imageFormatHelpers.detectRasterImageMediaType(Buffer.from('{"not":"an image"}')),
    "",
    "raster detection should reject arbitrary bytes even when an upstream MIME claims image content",
  );

  const signedPolicy = withEnvOverrides(signingEnv, () => (
    loadCommonJsModule("server/image-source-policy.js")
  ));
  const signedSource = "https://assets.example.com/cover.png?token=1";
  const sourceSignature = signedPolicy.createImageSourceSignature(signedSource);
  assert.equal(sourceSignature.length, 43, "image source signatures should use fixed-length base64url HMACs");
  assert.equal(signedPolicy.verifyImageSourceSignature(signedSource, sourceSignature), true);
  assert.equal(signedPolicy.verifyImageSourceSignature(`${signedSource}x`, sourceSignature), false);
  assert.equal(
    signedPolicy.verifyImageSourceSignature(signedSource, ` ${sourceSignature}`),
    false,
    "signature verification should reject non-canonical whitespace variants",
  );
  const weakSecretPolicy = withEnvOverrides({
    IMAGE_PROXY_SIGNING_SECRET: "too-short",
    NOTION_TOKEN: "fallback-notion-token-that-is-long-enough-to-sign",
  }, () => loadCommonJsModule("server/image-source-policy.js"));
  assert.equal(
    weakSecretPolicy.isImageProxySigningConfigured(),
    false,
    "an explicitly configured weak signing secret should fail closed instead of silently changing keys",
  );
  const signedSummary = signedPolicy.withCoverImageSignature({ coverImage: signedSource });
  assert.equal(
    signedPolicy.verifyImageSourceSignature(signedSource, signedSummary.coverImageSignature),
    true,
    "public post summaries should carry a valid cover source signature",
  );
  const [signedImageBlock] = signedPolicy.withBlockImageSignatures([{
    type: "image",
    url: signedSource,
  }]);
  assert.equal(
    signedPolicy.verifyImageSourceSignature(signedSource, signedImageBlock.imageProxySignature),
    true,
    "mapped article image blocks should carry a valid proxy signature",
  );

  const requestGuardHelpers = loadCommonJsModule("server/request-guard.js");
  const limiter = requestGuardHelpers.createFixedWindowRateLimiter({ limit: 2, windowMs: 1_000 });
  assert.equal(limiter.consume("client", 100).allowed, true);
  assert.equal(limiter.consume("client", 200).allowed, true);
  assert.equal(limiter.consume("client", 300).allowed, false);
  assert.equal(limiter.consume("client", 1_101).allowed, true, "rate limits should reset after their bounded window");
  const gate = requestGuardHelpers.createConcurrencyGate(1);
  const releaseGate = gate.tryAcquire();
  assert.equal(typeof releaseGate, "function");
  assert.equal(gate.tryAcquire(), null, "concurrency gates should fail fast when saturated");
  releaseGate();
  assert.equal(typeof gate.tryAcquire(), "function", "concurrency capacity should return after release");

  let imageProxyFetchUrl = "";
  let imageProxyLookupAddress = "";
  const successfulImageModule = loadSignedModule("api/image.js", {
    __IMAGE_PROXY_DNS_LOOKUP__: publicImageDnsLookup,
    __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
      body: coverSourcePng,
      headers: {
        "content-type": "image/png",
        "content-length": String(coverSourcePng.byteLength),
      },
      onRequest(url, options) {
        imageProxyFetchUrl = String(url);
        assert.equal(options.autoSelectFamily, true, "validated DNS answers should retain IPv4/IPv6 fallback support");
        assert.equal(typeof options.lookup, "function", "image proxy endpoint should pin the validated DNS address");
        options.lookup("assets.example.com", {}, (error, address, family) => {
          assert.equal(error, null);
          imageProxyLookupAddress = address;
          assert.equal(family, 4);
        });
        options.lookup("assets.example.com", { all: true }, (error, addresses) => {
          assert.equal(error, null);
          assert.equal(addresses.length, 1);
          assert.equal(addresses[0].address, "93.184.216.34");
          assert.equal(addresses[0].family, 4);
        });
      },
    }),
  });
  const imageProxySuccessRes = createApiResponseRecorder();
  const successfulImageUrl = "https://assets.example.com/cover.png";
  await successfulImageModule.handler({
    method: "GET",
    headers: { "x-forwarded-for": "203.0.113.10" },
    query: {
      src: successfulImageUrl,
      sig: successfulImageModule.sign(successfulImageUrl),
    },
  }, imageProxySuccessRes);
  assert.equal(imageProxySuccessRes.statusCode, 200);
  assert.equal(imageProxyFetchUrl, successfulImageUrl);
  assert.equal(imageProxyLookupAddress, "93.184.216.34");
  assert.equal(imageProxySuccessRes.getHeader("content-type"), "image/png");
  assert.ok(imageProxySuccessRes.getHeader("cache-control")?.includes("s-maxage=604800"));
  assert.equal(Buffer.compare(imageProxySuccessRes.textBody, coverSourcePng), 0);
  const imageProxyHeadRes = createApiResponseRecorder();
  await successfulImageModule.handler({
    method: "HEAD",
    headers: { "x-forwarded-for": "203.0.113.11" },
    query: {
      src: successfulImageUrl,
      sig: successfulImageModule.sign(successfulImageUrl),
    },
  }, imageProxyHeadRes);
  assert.equal(imageProxyHeadRes.statusCode, 200);
  assert.equal(imageProxyHeadRes.getHeader("content-type"), "image/png");
  assert.equal(imageProxyHeadRes.getHeader("content-length"), String(coverSourcePng.byteLength));
  assert.equal(imageProxyHeadRes.textBody, "", "HEAD should validate the GET representation without returning its body");

  let unsignedFetchCount = 0;
  const unsignedImageModule = loadSignedModule("api/image.js", {
    __IMAGE_PROXY_DNS_LOOKUP__: publicImageDnsLookup,
    __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
      onRequest() {
        unsignedFetchCount += 1;
      },
    }),
  });
  const unsignedImageRes = createApiResponseRecorder();
  await unsignedImageModule.handler({
    method: "GET",
    headers: {},
    query: { src: successfulImageUrl },
  }, unsignedImageRes);
  assert.equal(unsignedImageRes.statusCode, 403);
  assert.equal(unsignedImageRes.getHeader("content-type"), "application/json; charset=utf-8");
  assert.equal(unsignedFetchCount, 0, "unsigned sources should be rejected before DNS or upstream I/O");

  const duplicateSourceRes = createApiResponseRecorder();
  await unsignedImageModule.handler({
    method: "GET",
    headers: {},
    query: {
      src: [successfulImageUrl, successfulImageUrl],
      sig: unsignedImageModule.sign(successfulImageUrl),
    },
  }, duplicateSourceRes);
  assert.equal(duplicateSourceRes.statusCode, 400, "duplicated signed query fields should be rejected");
  assert.equal(unsignedFetchCount, 0);

  const nonCanonicalSourceRes = createApiResponseRecorder();
  await unsignedImageModule.handler({
    method: "GET",
    headers: {},
    query: {
      src: ` ${successfulImageUrl}`,
      sig: unsignedImageModule.sign(successfulImageUrl),
    },
  }, nonCanonicalSourceRes);
  assert.equal(nonCanonicalSourceRes.statusCode, 400, "non-canonical source variants should not fragment the cache key");
  assert.equal(unsignedFetchCount, 0);

  const strictQueryRes = createApiResponseRecorder();
  await unsignedImageModule.handler({
    method: "GET",
    headers: {},
    query: {
      cacheBust: "1",
      src: successfulImageUrl,
      sig: unsignedImageModule.sign(successfulImageUrl),
    },
  }, strictQueryRes);
  assert.equal(strictQueryRes.statusCode, 400, "unexpected query keys should not bypass the canonical CDN cache key");
  assert.equal(unsignedFetchCount, 0);

  let limitedFetchCount = 0;
  const limitedImageModule = loadSignedModule("api/image.js", {
    __IMAGE_PROXY_DNS_LOOKUP__: publicImageDnsLookup,
    __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
      body: coverSourcePng,
      headers: {
        "content-type": "image/png",
        "content-length": String(coverSourcePng.byteLength),
      },
      onRequest() {
        limitedFetchCount += 1;
      },
    }),
  }, {
    IMAGE_PROXY_RATE_LIMIT_PER_MINUTE: "1",
  });
  const limitedQuery = {
    src: successfulImageUrl,
    sig: limitedImageModule.sign(successfulImageUrl),
  };
  await limitedImageModule.handler({
    method: "GET",
    headers: { "x-forwarded-for": "203.0.113.20" },
    query: limitedQuery,
  }, createApiResponseRecorder());
  const rateLimitedRes = createApiResponseRecorder();
  await limitedImageModule.handler({
    method: "GET",
    headers: { "x-forwarded-for": "203.0.113.20" },
    query: limitedQuery,
  }, rateLimitedRes);
  assert.equal(rateLimitedRes.statusCode, 429);
  assert.equal(rateLimitedRes.getHeader("retry-after"), "60");
  assert.equal(limitedFetchCount, 1, "rate-limited requests should not perform upstream work");

  const unconfiguredImageHandler = withEnvOverrides({
    IMAGE_PROXY_SIGNING_SECRET: null,
    NOTION_TOKEN: null,
  }, () => loadCommonJsModule("api/image.js"));
  const unconfiguredImageRes = createApiResponseRecorder();
  await unconfiguredImageHandler({ method: "GET", headers: {}, query: { src: successfulImageUrl } }, unconfiguredImageRes);
  assert.equal(unconfiguredImageRes.statusCode, 503, "image proxy should fail closed when no signing key is configured");

  const dnsTimeoutModule = loadSignedModule("api/image.js", {
    __IMAGE_PROXY_DNS_LOOKUP__: () => new Promise(() => {}),
    __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
      onRequest() {
        throw new Error("a timed-out DNS lookup must not start an upstream request");
      },
    }),
  }, {
    IMAGE_PROXY_TIMEOUT_MS: "20",
  });
  const dnsTimeoutRes = createApiResponseRecorder();
  await dnsTimeoutModule.handler({
    method: "GET",
    headers: {},
    query: {
      src: successfulImageUrl,
      sig: dnsTimeoutModule.sign(successfulImageUrl),
    },
  }, dnsTimeoutRes);
  assert.equal(dnsTimeoutRes.statusCode, 504, "the request timeout should include initial DNS resolution");

  const successfulCoverModule = loadSignedModule("api/cover.js", {
    __IMAGE_PROXY_DNS_LOOKUP__: publicImageDnsLookup,
    __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
      body: coverSourcePng,
      headers: {
        "content-type": "image/png",
        "content-length": String(coverSourcePng.byteLength),
      },
    }),
  });
  const coverProxySuccessRes = createApiResponseRecorder();
  await successfulCoverModule.handler({
    method: "GET",
    headers: { accept: "image/avif;q=0.4,image/webp;q=1,image/*;q=0.2" },
    query: {
      src: successfulImageUrl,
      sig: successfulCoverModule.sign(successfulImageUrl),
      w: "320",
    },
  }, coverProxySuccessRes);
  assert.equal(coverProxySuccessRes.statusCode, 200);
  assert.equal(coverProxySuccessRes.getHeader("content-type"), "image/webp", "higher Accept quality should beat server format preference");
  assert.ok(coverProxySuccessRes.getHeader("cache-control")?.includes("s-maxage=2592000"));
  assert.equal(coverProxySuccessRes.getHeader("vary"), "Accept");
  assert.equal(coverProxySuccessRes.textBody.subarray(8, 12).toString("ascii"), "WEBP");
  const coverProxyHeadRes = createApiResponseRecorder();
  await successfulCoverModule.handler({
    method: "HEAD",
    headers: { accept: "image/webp", "x-forwarded-for": "203.0.113.12" },
    query: {
      src: successfulImageUrl,
      sig: successfulCoverModule.sign(successfulImageUrl),
      w: "320",
    },
  }, coverProxyHeadRes);
  assert.equal(coverProxyHeadRes.statusCode, 200);
  assert.equal(coverProxyHeadRes.getHeader("content-type"), "image/webp");
  assert.ok(Number(coverProxyHeadRes.getHeader("content-length")) > 0);
  assert.equal(coverProxyHeadRes.textBody, "", "cover HEAD should run the real transform without returning a body");

  const duplicateCoverParameterRes = createApiResponseRecorder();
  await successfulCoverModule.handler({
    method: "GET",
    headers: { accept: "image/webp" },
    query: {
      src: successfulImageUrl,
      sig: successfulCoverModule.sign(successfulImageUrl),
      w: ["320", "640"],
    },
  }, duplicateCoverParameterRes);
  assert.equal(duplicateCoverParameterRes.statusCode, 400, "duplicate optional cover parameters should be rejected");
  for (const nonCanonicalQuery of [
    { w: "0320" },
    { w: "" },
    { format: "auto", w: "320" },
    { format: "JPEG", w: "320" },
  ]) {
    const nonCanonicalCoverRes = createApiResponseRecorder();
    await successfulCoverModule.handler({
      method: "GET",
      headers: { accept: "image/webp" },
      query: {
        src: successfulImageUrl,
        sig: successfulCoverModule.sign(successfulImageUrl),
        ...nonCanonicalQuery,
      },
    }, nonCanonicalCoverRes);
    assert.equal(
      nonCanonicalCoverRes.statusCode,
      400,
      "cover variants should use one canonical query representation",
    );
  }

  const explicitJpegRes = createApiResponseRecorder();
  await successfulCoverModule.handler({
    method: "GET",
    headers: { accept: "image/avif" },
    query: {
      format: "jpeg",
      src: successfulImageUrl,
      sig: successfulCoverModule.sign(successfulImageUrl),
      w: "320",
    },
  }, explicitJpegRes);
  assert.equal(explicitJpegRes.getHeader("content-type"), "image/jpeg");
  assert.equal(explicitJpegRes.getHeader("vary"), undefined, "explicit formats should not retain a stale Accept variance");
  assert.deepEqual([...explicitJpegRes.textBody.subarray(0, 3)], [0xff, 0xd8, 0xff]);

  const coverNotAcceptableRes = createApiResponseRecorder();
  await successfulCoverModule.handler({
    method: "GET",
    headers: { accept: "image/avif;q=0,image/webp;q=0,image/jpeg;q=0" },
    query: {
      src: successfulImageUrl,
      sig: successfulCoverModule.sign(successfulImageUrl),
      w: "320",
    },
  }, coverNotAcceptableRes);
  assert.equal(coverNotAcceptableRes.statusCode, 406);
  assert.equal(coverNotAcceptableRes.getHeader("content-type"), "application/json; charset=utf-8");

  const invalidRasterBody = Buffer.from('{"error":"not an image"}');
  const invalidRasterImageModule = loadSignedModule("api/image.js", {
    __IMAGE_PROXY_DNS_LOOKUP__: publicImageDnsLookup,
    __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
      body: invalidRasterBody,
      headers: {
        "content-type": "image/png",
        "content-length": String(invalidRasterBody.byteLength),
      },
    }),
  });
  const invalidRasterImageRes = createApiResponseRecorder();
  await invalidRasterImageModule.handler({
    method: "GET",
    headers: {},
    query: {
      src: successfulImageUrl,
      sig: invalidRasterImageModule.sign(successfulImageUrl),
    },
  }, invalidRasterImageRes);
  assert.equal(invalidRasterImageRes.statusCode, 415);
  assert.equal(invalidRasterImageRes.getHeader("content-type"), "application/json; charset=utf-8");
  assert.equal(invalidRasterImageRes.getHeader("cache-control"), "no-store");
  const invalidRasterHeadRes = createApiResponseRecorder();
  await invalidRasterImageModule.handler({
    method: "HEAD",
    headers: {},
    query: {
      src: successfulImageUrl,
      sig: invalidRasterImageModule.sign(successfulImageUrl),
    },
  }, invalidRasterHeadRes);
  assert.equal(invalidRasterHeadRes.statusCode, 415, "HEAD must not bypass raw raster validation");

  const invalidCoverModule = loadSignedModule("api/cover.js", {
    __IMAGE_PROXY_DNS_LOOKUP__: publicImageDnsLookup,
    __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
      body: invalidRasterBody,
      headers: {
        "content-type": "image/png",
        "content-length": String(invalidRasterBody.byteLength),
      },
    }),
  });
  const invalidCoverRes = createApiResponseRecorder();
  await invalidCoverModule.handler({
    method: "GET",
    headers: { accept: "image/webp" },
    query: {
      src: successfulImageUrl,
      sig: invalidCoverModule.sign(successfulImageUrl),
      w: "320",
    },
  }, invalidCoverRes);
  assert.equal(invalidCoverRes.statusCode, 415);
  assert.equal(invalidCoverRes.getHeader("content-type"), "application/json; charset=utf-8");
  assert.equal(invalidCoverRes.getHeader("vary"), undefined);
  assert.equal(invalidCoverRes.getHeader("content-length"), undefined);
  const invalidCoverHeadRes = createApiResponseRecorder();
  await invalidCoverModule.handler({
    method: "HEAD",
    headers: { accept: "image/webp" },
    query: {
      src: successfulImageUrl,
      sig: invalidCoverModule.sign(successfulImageUrl),
      w: "320",
    },
  }, invalidCoverHeadRes);
  assert.equal(invalidCoverHeadRes.statusCode, 415, "HEAD must not bypass cover source validation");

  let blockedFetchCount = 0;
  const blockedImageModule = loadSignedModule("api/image.js", {
    __IMAGE_PROXY_DNS_LOOKUP__: publicImageDnsLookup,
    __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
      onRequest() {
        blockedFetchCount += 1;
      },
    }),
  });
  for (const blockedUrl of [
    "https://127.0.0.1/private.png",
    "https://2130706433/private.png",
    "https://0x7f000001/private.png",
    "https://subdomain.localhost/private.png",
    "https://[::1]/private.png",
    "https://[::ffff:127.0.0.1]/private.png",
  ]) {
    const blockedRes = createApiResponseRecorder();
    await blockedImageModule.handler({
      method: "GET",
      headers: {},
      query: {
        src: blockedUrl,
        sig: blockedImageModule.sign(blockedUrl),
      },
    }, blockedRes);
    assert.equal(blockedRes.statusCode, 400);
  }
  assert.equal(blockedFetchCount, 0, "private hosts should be rejected before upstream I/O");
  const imageProxyHelpers = loadCommonJsModule("server/image-proxy.js");
  for (const reservedAddress of [
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "2001:db8::1",
    "3fff::1",
  ]) {
    assert.equal(
      imageProxyHelpers.isBlockedIpAddress(reservedAddress),
      true,
      `${reservedAddress} should not be treated as a public image origin`,
    );
  }
  assert.equal(imageProxyHelpers.isBlockedIpAddress("93.184.216.34"), false);
  assert.equal(imageProxyHelpers.isBlockedIpAddress("2606:4700:4700::1111"), false);
  assert.equal(
    imageProxyHelpers.getImageProxyErrorStatus({ status: 304 }),
    502,
    "non-error upstream status codes should not become invalid JSON error responses",
  );

  const dnsBlockedModule = loadSignedModule("api/image.js", {
    __IMAGE_PROXY_DNS_LOOKUP__: async () => [{ address: "10.0.0.8", family: 4 }],
    __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
      onRequest() {
        throw new Error("DNS-blocked image URL should not be fetched");
      },
    }),
  });
  const dnsBlockedRes = createApiResponseRecorder();
  await dnsBlockedModule.handler({
    method: "GET",
    headers: {},
    query: {
      src: successfulImageUrl,
      sig: dnsBlockedModule.sign(successfulImageUrl),
    },
  }, dnsBlockedRes);
  assert.equal(dnsBlockedRes.statusCode, 400);

  let redirectFetchCount = 0;
  const redirectBlockedModule = loadSignedModule("api/image.js", {
    __IMAGE_PROXY_DNS_LOOKUP__: publicImageDnsLookup,
    __IMAGE_PROXY_HTTPS_REQUEST__: createImageRequestMock({
      status: 302,
      headers: { location: "https://[::1]/private.png" },
      onRequest() {
        redirectFetchCount += 1;
      },
    }),
  });
  const redirectBlockedRes = createApiResponseRecorder();
  await redirectBlockedModule.handler({
    method: "GET",
    headers: {},
    query: {
      src: successfulImageUrl,
      sig: redirectBlockedModule.sign(successfulImageUrl),
    },
  }, redirectBlockedRes);
  assert.equal(redirectBlockedRes.statusCode, 400);
  assert.equal(redirectFetchCount, 1, "blocked redirect targets should not receive a second request");

  const imageProxyMethodRes = createApiResponseRecorder();
  await apiImageHandler({ method: "POST", query: {} }, imageProxyMethodRes);
  assert.equal(imageProxyMethodRes.statusCode, 405);
  const coverProxyMethodRes = createApiResponseRecorder();
  await apiCoverHandler({ method: "POST", query: {} }, coverProxyMethodRes);
  assert.equal(coverProxyMethodRes.statusCode, 405);
}
