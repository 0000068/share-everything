export async function runApiContractChecks(context) {
  const {
    assert,
    createApiResponseRecorder,
    expectIncludes,
    loadCommonJsModule,
  } = context;

  const publicContentHelpers = loadCommonJsModule("server/public-content.js");
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
          async queryPublicPosts(query) {
            queryCalls.push(query);
            return expectedPayload;
          },
        };
      }

      if (specifier === "../server/public-content") {
        return publicContentHelpers;
      }

      throw new Error(`Unexpected api/posts-data.js dependency in contract test: ${specifier}`);
    },
  });

  const response = createApiResponseRecorder();
  await postsDataHandler({
    method: "GET",
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
  await postDataHandler({
    method: "GET",
    query: { id: "550e8400-e29b-41d4-a716-446655440000" },
  }, validPostDataResponse);

  assert.equal(validPostDataResponse.statusCode, 200, "post-data contract should accept canonical Notion page ids");
  assert.equal(
    JSON.stringify(postDataFetchCalls),
    JSON.stringify(["550e8400-e29b-41d4-a716-446655440000"]),
    "post-data contract should pass validated page ids to the Notion layer unchanged",
  );
}
