export async function runApiContractChecks(context) {
  const {
    assert,
    createApiResponseRecorder,
    expectIncludes,
    loadCommonJsModule,
  } = context;

  const publicContentHelpers = loadCommonJsModule("server/public-content.js");
  const canonicalQueryHelpers = loadCommonJsModule("server/canonical-query.js");
  const requestLifecycleHelpers = loadCommonJsModule("server/request-lifecycle.js");
  assert.equal(
    canonicalQueryHelpers.hasCanonicalRequestSearch({ url: "/api/posts-data" }, []),
    true,
    "canonical query matching should accept a request target with no query delimiter",
  );
  for (const url of ["/api/posts-data?", "/api/posts-data#fragment"]) {
    assert.equal(
      canonicalQueryHelpers.hasCanonicalRequestSearch({ url }, []),
      false,
      `canonical query matching should reject raw request-target noise: ${url}`,
    );
  }
  const queryCalls = [];
  const expectedPayload = {
    results: [
      {
        id: "post-1",
        title: "Contract Post",
        category: "AI",
        categoryLabel: "AI Lab",
        categoryColor: {
          bg: "rgba(41, 121, 255, 0.1)",
          color: "#2979ff",
          border: "rgba(41, 121, 255, 0.2)",
        },
        coverGradient: "linear-gradient(135deg, #0d1b4b, #1a3a6b)",
      },
    ],
    categories: [
      {
        name: "\u5168\u90e8",
        label: "\u5168\u90e8",
        emoji: "\u{1f4cb}",
        categoryColor: {
          bg: "rgba(0, 229, 255, 0.1)",
          color: "#00e5ff",
          border: "rgba(0, 229, 255, 0.2)",
        },
        coverGradient: "linear-gradient(135deg, #1a1a2e, #16213e)",
      },
      {
        name: "AI",
        label: "AI Lab",
        emoji: "\u{1f916}",
        categoryColor: {
          bg: "rgba(41, 121, 255, 0.1)",
          color: "#2979ff",
          border: "rgba(41, 121, 255, 0.2)",
        },
        coverGradient: "linear-gradient(135deg, #0d1b4b, #1a3a6b)",
      },
    ],
    total: 1,
    totalPages: 1,
    currentPage: 1,
  };

  const postsDataHandler = loadCommonJsModule("api/posts-data.js", [], {
    require(specifier) {
      if (specifier === "../server/notion-server") {
        return {
          ALL_CATEGORY: "\u5168\u90e8",
          PUBLIC_CATEGORY_QUERY_MAX_LENGTH: 128,
          PUBLIC_SEARCH_QUERY_MAX_LENGTH: 256,
          async queryPublicPosts(query) {
            queryCalls.push(query);
            return expectedPayload;
          },
        };
      }

      if (specifier === "../server/public-content") {
        return publicContentHelpers;
      }
      if (specifier === "../server/canonical-query") {
        return canonicalQueryHelpers;
      }
      if (specifier === "../server/request-lifecycle") {
        return requestLifecycleHelpers;
      }

      throw new Error(`Unexpected api/posts-data.js dependency in contract test: ${specifier}`);
    },
  });

  const response = createApiResponseRecorder();
  await postsDataHandler({
    method: "GET",
    url: "/api/posts-data?category=AI&search=semantic&page=2",
    query: {
      category: "AI",
      search: "semantic",
      page: "2",
    },
  }, response);

  assert.equal(response.statusCode, 200, "posts-data contract should return HTTP 200 for successful public list requests");
  assert.equal(
    response.getHeader("cache-control"),
    "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    "posts-data contract should allow short-lived CDN caching while forcing browser revalidation",
  );
  assert.equal(
    JSON.stringify(queryCalls),
    JSON.stringify([{ category: "AI", search: "semantic", page: 2 }]),
    "posts-data contract should pass normalized list query parameters to the Notion server layer",
  );
  assert.equal(
    JSON.stringify(response.jsonBody),
    JSON.stringify(expectedPayload),
    "posts-data contract should preserve category presentation fields returned by the server layer",
  );
  assert.equal(
    JSON.stringify(response.jsonBody.categories[1].categoryColor),
    JSON.stringify(expectedPayload.categories[1].categoryColor),
    "posts-data contract should keep category color metadata for browser filter UI",
  );
  assert.equal(
    response.jsonBody.results[0].categoryLabel,
    "AI Lab",
    "posts-data contract should keep per-post display category labels",
  );
  assert.equal(
    response.jsonBody.results[0].coverGradient,
    "linear-gradient(135deg, #0d1b4b, #1a3a6b)",
    "posts-data contract should keep per-post cover gradient fallbacks",
  );

  expectIncludes(
    JSON.stringify(response.jsonBody),
    "categoryColor",
    "posts-data contract should expose category color fields in the final JSON payload",
  );

  for (const invalidQuery of [
    { page: "1" },
    { page: "02" },
    { page: "10001" },
    { category: "\u5168\u90e8" },
    { search: " padded " },
    { search: ["duplicate", "query"] },
    { unexpected: "1" },
  ]) {
    const invalidQueryResponse = createApiResponseRecorder();
    await postsDataHandler({ method: "GET", query: invalidQuery }, invalidQueryResponse);
    assert.equal(
      invalidQueryResponse.statusCode,
      400,
      `posts-data should reject non-canonical query input: ${JSON.stringify(invalidQuery)}`,
    );
  }
  const nonCanonicalOrderResponse = createApiResponseRecorder();
  await postsDataHandler({
    method: "GET",
    url: "/api/posts-data?search=semantic&category=AI&page=2",
    query: { category: "AI", search: "semantic", page: "2" },
  }, nonCanonicalOrderResponse);
  assert.equal(
    nonCanonicalOrderResponse.statusCode,
    400,
    "posts-data should reject semantically duplicate cache keys with non-canonical query ordering",
  );
  assert.equal(queryCalls.length, 1, "invalid post-list query variants should not reach Notion");
  for (const url of ["/api/posts-data?", "/api/posts-data#fragment"]) {
    const rawVariantResponse = createApiResponseRecorder();
    await postsDataHandler({ method: "GET", url, query: {} }, rawVariantResponse);
    assert.equal(rawVariantResponse.statusCode, 400, `posts-data should reject raw query variants: ${url}`);
  }

  const postDataFetchCalls = [];
  const postDataHandler = loadCommonJsModule("api/post-data.js", [], {
    require(specifier) {
      if (specifier === "../server/notion-server") {
        return {
          async fetchPublicPost(postId) {
            postDataFetchCalls.push(postId);
            return {
              id: postId,
              title: "Contract detail",
              content: [],
            };
          },
        };
      }

      if (specifier === "../server/public-content") {
        return publicContentHelpers;
      }
      if (specifier === "../server/canonical-query") {
        return canonicalQueryHelpers;
      }
      if (specifier === "../server/request-lifecycle") {
        return requestLifecycleHelpers;
      }

      throw new Error(`Unexpected api/post-data.js dependency in contract test: ${specifier}`);
    },
  });

  const invalidPostDataResponse = createApiResponseRecorder();
  await postDataHandler({
    method: "GET",
    query: { id: "unsafe/post?debug=1" },
  }, invalidPostDataResponse);

  assert.equal(
    invalidPostDataResponse.statusCode,
    404,
    "post-data contract should reject path-like ids before contacting the Notion layer",
  );
  assert.equal(
    postDataFetchCalls.length,
    0,
    "post-data contract should avoid upstream work for invalid public post ids",
  );

  const validPostDataResponse = createApiResponseRecorder();
  const canonicalPostId = "550e8400e29b41d4a716446655440000";
  await postDataHandler({
    method: "GET",
    url: `/api/post-data?id=${canonicalPostId}`,
    query: { id: canonicalPostId },
  }, validPostDataResponse);

  assert.equal(validPostDataResponse.statusCode, 200, "post-data contract should accept canonical Notion page ids");
  assert.equal(
    validPostDataResponse.getHeader("cache-control"),
    "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    "successful public post JSON should use short edge caching with stale revalidation",
  );
  assert.equal(
    JSON.stringify(postDataFetchCalls),
    JSON.stringify([canonicalPostId]),
    "post-data contract should pass the unique compact lowercase page id to the Notion layer",
  );

  for (const request of [
    {
      url: "/api/post-data?id=550e8400-e29b-41d4-a716-446655440000",
      query: { id: "550e8400-e29b-41d4-a716-446655440000" },
    },
    {
      url: `/api/post-data?id=${canonicalPostId}&debug=1`,
      query: { id: canonicalPostId, debug: "1" },
    },
    {
      url: `/api/post-data?id=${canonicalPostId}&id=${canonicalPostId}`,
      query: { id: [canonicalPostId, canonicalPostId] },
    },
    {
      url: `/api/post-data?id=${canonicalPostId.toUpperCase()}`,
      query: { id: canonicalPostId.toUpperCase() },
    },
    {
      url: `/api/post-data?id=${canonicalPostId}#fragment`,
      query: { id: canonicalPostId },
    },
  ]) {
    const nonCanonicalResponse = createApiResponseRecorder();
    await postDataHandler({ method: "GET", ...request }, nonCanonicalResponse);
    assert.equal(
      nonCanonicalResponse.statusCode,
      request.query.id instanceof Array ? 404 : 400,
      `post-data should reject non-canonical cache-key variants: ${request.url}`,
    );
  }
  assert.equal(
    postDataFetchCalls.length,
    1,
    "non-canonical post-data query variants should not reach Notion",
  );
}
