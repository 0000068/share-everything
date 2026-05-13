export async function runPublicContentAndNotionChecks(context) {
  const {
    assert,
    blogPageJs,
    createJsonResponse,
    expectIncludes,
    expectNotIncludes,
    loadCommonJsModule,
    publicContentHelpers,
    publicContentJs,
    readmeMd,
    serverNotionHelpers,
    serverNotionJs,
    withEnvOverrides,
  } = context;

expectIncludes(publicContentJs, "getPublicPostErrorStatus", "public content helper should centralize post error mapping");
expectNotIncludes(publicContentJs, "notion_public_config_error", "public content helper should not keep field-based public access errors in database-wide public mode");
expectNotIncludes(blogPageJs, "公开字段或发布状态", "blog frontend should not suggest field-based public publishing in database-wide public mode");
expectNotIncludes(readmeMd, "发布状态改为", "README should not describe status-field publishing in database-wide public mode");
expectIncludes(publicContentJs, "notion_timeout_error", "public content helper should preserve upstream timeout status");
expectIncludes(publicContentJs, "Retry-After", "public content helper should preserve retry guidance for upstream rate limits");
expectIncludes(publicContentJs, "restricted_resource", "public content helper should classify upstream Notion permission failures as server-side integration faults");
expectIncludes(publicContentJs, "object_not_found", "public content helper should classify missing upstream Notion objects as configuration faults");
expectIncludes(publicContentJs, "resourceType", "public content helper should distinguish database and page Notion errors");
assert.equal(
  publicContentHelpers.getPublicContentErrorStatus({
    status: 429,
    notionCode: "rate_limited",
  }),
  429,
  "public content helper should preserve Notion rate-limit responses as HTTP 429",
);
assert.equal(
  publicContentHelpers.getPublicContentErrorStatus({
    status: 401,
    notionCode: "unauthorized",
  }),
  500,
  "public content helper should treat upstream auth failures as a stable server-side configuration error",
);
assert.equal(
  publicContentHelpers.getPublicContentErrorStatus({
    status: 403,
    notionCode: "restricted_resource",
  }),
  500,
  "public content helper should treat upstream permission failures as a stable server-side configuration error",
);
assert.equal(
  publicContentHelpers.getPublicContentErrorStatus({
    status: 404,
    notionCode: "object_not_found",
  }),
  500,
  "public content helper should treat missing upstream Notion objects as a stable server-side configuration error",
);
assert.equal(
  publicContentHelpers.getPublicPostErrorStatus({
    status: 404,
    notionCode: "object_not_found",
    resourceType: "database",
    detail: "Could not find database with ID: test-database",
  }),
  500,
  "public post helper should treat missing database metadata as a server-side configuration error",
);
assert.equal(
  publicContentHelpers.getPublicPostErrorStatus({
    status: 400,
    notionCode: "validation_error",
    resourceType: "database",
    detail: "path failed validation: path.database_id should be a valid uuid",
  }),
  500,
  "public post helper should treat invalid database ids as server-side configuration errors",
);
assert.equal(
  publicContentHelpers.getPublicPostErrorStatus({
    status: 404,
    notionCode: "object_not_found",
    resourceType: "page",
    detail: "Could not find page with ID: missing-post",
  }),
  404,
  "public post helper should keep missing Notion pages as article-not-found responses",
);
assert.equal(
  publicContentHelpers.getPublicPostErrorStatus({
    status: 400,
    notionCode: "validation_error",
    resourceType: "page",
  }),
  404,
  "public post helper should keep invalid route page ids as article-not-found responses",
);
const publicErrorHeaders = [];
publicContentHelpers.applyPublicErrorHeaders({
  setHeader(name, value) {
    publicErrorHeaders.push([name, value]);
  },
}, {
  retryAfter: "30",
});
assert.equal(
  JSON.stringify(publicErrorHeaders),
  JSON.stringify([["Retry-After", "30"]]),
  "public content helper should forward Retry-After headers for rate-limited upstream responses",
);
const sanitizedPublicError = publicContentHelpers.serializePublicError({
  code: "notion_config_error",
  notionCode: "object_not_found",
  detail: "Could not find database with ID: secret-database-id",
}, "Post list unavailable");
assert.equal(
  Object.prototype.hasOwnProperty.call(sanitizedPublicError, "detail"),
  false,
  "public content helper should not expose upstream error details by default",
);
expectIncludes(serverNotionJs, "queryPublicPages", "server notion layer should expose a filtered public page query helper");
expectIncludes(serverNotionJs, "queryPublicPosts", "server notion layer should provide a public post query helper");
expectIncludes(serverNotionJs, "getNotionResourceType", "server notion layer should annotate upstream errors with the Notion resource type");
expectIncludes(serverNotionJs, "PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS", "server notion layer should define a short-lived public summary cache");
expectIncludes(serverNotionJs, "buildContentSchema", "server notion layer should derive content property mappings from database metadata");
expectIncludes(serverNotionJs, "buildDatabaseSorts", "server notion layer should derive list sorting from the resolved schema");
expectIncludes(serverNotionJs, "normalizePostQueryFilters", "server notion layer should normalize category and search inputs before querying");
expectIncludes(serverNotionJs, "PUBLIC_SEARCH_QUERY_MAX_LENGTH", "server notion layer should cap public search query input length");
expectIncludes(serverNotionJs, "normalizeSiteOrigin", "server notion layer should validate SITE_URL before generating public URLs");
expectIncludes(serverNotionJs, "includeSearchText: true", "server notion layer should precompute public post search text when mapping Notion pages");
expectIncludes(serverNotionJs, "hasPostQueryFilters", "server notion layer should detect when filtered queries need extra work");
expectIncludes(serverNotionJs, "NOTION_REQUEST_TIMEOUT_MS", "server notion layer should define a request timeout for upstream calls");
expectIncludes(serverNotionJs, "AbortController", "server notion layer should abort slow Notion requests");
expectIncludes(serverNotionJs, "runWithBlockChildConcurrency", "server notion layer should limit recursive block child fetch concurrency");
expectIncludes(serverNotionJs, "buildDatabaseWidePublicAccessPolicy", "server notion layer should keep v2.5-compatible database-wide public mode");
expectNotIncludes(
  serverNotionJs,
  "buildPublicAccessPolicyFromDatabase(database)",
  "server notion layer should not pass unused database metadata to the database-wide public policy builder",
);
expectNotIncludes(serverNotionJs, "findPropertyEntriesByCandidates", "server notion layer should not inspect public visibility properties in database-wide public mode");
expectNotIncludes(serverNotionJs, "NOTION_PUBLIC_PROPERTY_NAME", "server notion layer should ignore public visibility property env vars in database-wide public mode");
expectNotIncludes(serverNotionJs, "NOTION_PUBLIC_STATUS_VALUES", "server notion layer should ignore public status env vars in database-wide public mode");
expectNotIncludes(serverNotionJs, "NOTION_ALLOW_DATABASE_WIDE_PUBLIC_ACCESS", "server notion layer should not require opt-in for database-wide public mode");
expectIncludes(serverNotionJs, 'require("../js/notion-content")', "server notion layer should reuse the shared notion content helpers");
expectIncludes(serverNotionJs, "buildSharedArticleStructuredData", "server notion layer should delegate article structured data to the shared content helper");
expectIncludes(serverNotionJs, "resolveNotionContentSchema", "server notion layer should resolve renamed content properties from database metadata");
expectIncludes(serverNotionJs, "renderPostContent", "server notion layer should render SSR post HTML without duplicating it in API payloads");
expectNotIncludes(serverNotionJs, "buildSearchFilter", "server notion layer should not delegate search semantics to upstream filters that behave differently from local search");
expectNotIncludes(serverNotionJs, 'category === "閸忋劑鍎?', "server notion layer should not compare against a mojibake category label");
const resolvedContentSchema = serverNotionHelpers.buildContentSchema({
  properties: {
    Title: { id: "title", name: "Title", type: "title" },
    Summary: { id: "excerpt", name: "Summary", type: "rich_text" },
    Category: { id: "category", name: "Category", type: "select" },
    "Published At": { id: "date", name: "Published At", type: "date" },
  },
});
assert.equal(
  resolvedContentSchema.title?.name,
  "Title",
  "server notion layer should resolve renamed content properties from database metadata",
);
assert.equal(
  JSON.stringify(serverNotionHelpers.buildDatabaseSorts(resolvedContentSchema)),
  JSON.stringify([{
    property: "Published At",
    direction: "descending",
  }]),
  "server notion layer should sort by the resolved date property instead of a hardcoded field name",
);
assert.equal(
  JSON.stringify(serverNotionHelpers.buildCategoryFilter("Tech", {
    category: { name: "Category", type: "select" },
  })),
  JSON.stringify({
    property: "Category",
    select: { equals: "Tech" },
  }),
  "category prefilter should only be emitted when the Notion schema still matches the expected select field",
);
assert.equal(
  serverNotionHelpers.buildCategoryFilter("Tech", {
    category: { name: "Category", type: "multi_select" },
  }),
  null,
  "category prefilter should disable itself instead of breaking requests when the Notion schema drifts",
);
const dynamicPublicCategories = serverNotionHelpers.buildPublicCategories({
  database: {
    properties: {
      Category: {
        id: "category",
        name: "Category",
        type: "select",
        select: {
          options: [
            { name: "AI", color: "blue" },
            { name: "读书", color: "green" },
          ],
        },
      },
    },
  },
  schema: {
    category: { id: "category", name: "Category", type: "select" },
  },
  posts: [
    { category: "项目记录" },
  ],
});
assert.equal(
  JSON.stringify(dynamicPublicCategories.map((category) => category.name)),
  JSON.stringify(["全部", "精选", "AI", "读书", "项目记录"]),
  "server notion layer should build category navigation from Notion select options plus used post categories while pinning featured",
);
assert.equal(
  serverNotionHelpers.decoratePostSummary({ id: "custom-category", category: "AI" }, new Map([[
    "ai",
    { name: "AI", notionColor: "blue", optionIndex: 0 },
  ]])).categoryLabel,
  "AI",
  "server notion layer should attach category presentation metadata to post summaries",
);
const databaseWideDefaultPublicAccessPolicy = withEnvOverrides({}, () => serverNotionHelpers.buildPublicAccessPolicyFromDatabase());
assert.equal(
  databaseWideDefaultPublicAccessPolicy.propertyType,
  "database",
  "server notion layer should default to database-wide public mode when no public visibility field is explicitly configured",
);
assert.equal(
  databaseWideDefaultPublicAccessPolicy.filter,
  null,
  "database-wide public mode should not emit a Notion visibility filter",
);
const databaseWideWithIgnoredPublicEnvPolicy = withEnvOverrides({
  NOTION_PUBLIC_PROPERTY_NAME: "MissingPublicFlag",
  NOTION_PUBLIC_PROPERTY_NAMES: "Status,Public,发布状态",
  NOTION_PUBLIC_STATUS_VALUES: "Published,Public,Live",
}, () => serverNotionHelpers.buildPublicAccessPolicyFromDatabase());
assert.equal(
  databaseWideWithIgnoredPublicEnvPolicy.propertyType,
  "database",
  "server notion layer should keep exposing the configured database even if legacy public env vars are set",
);
assert.equal(
  databaseWideWithIgnoredPublicEnvPolicy.filter,
  null,
  "database-wide public mode should ignore legacy public env vars and avoid Notion visibility filters",
);
assert.equal(
  serverNotionHelpers.filterPostsBySearch([
    { title: "", excerpt: "", tags: ["TypeScript"] },
    { title: "Other", excerpt: "", tags: ["Docs"] },
  ], "script").length,
  1,
  "local post search should preserve substring matches for tag text",
);
const boundedPostQueryFilters = serverNotionHelpers.normalizePostQueryFilters({
  category: ` ${"c".repeat(180)} `,
  search: ` ${"s".repeat(320)} `,
});
assert.equal(
  boundedPostQueryFilters.category.length,
  128,
  "server notion layer should cap category query input length before caching and filtering",
);
assert.equal(
  boundedPostQueryFilters.search.length,
  256,
  "server notion layer should cap search query input length before caching and filtering",
);
const builtPostPayload = serverNotionHelpers.buildPostPayload(
  {
    id: "post-1",
    title: "Payload title",
    excerpt: "Payload excerpt",
    category: "Tech",
    date: "2026-04-11",
    readTime: "5 min",
    tags: [],
  },
  [{
    type: "paragraph",
    paragraph: {
      rich_text: [{ plain_text: "Server rendered body" }],
    },
  }],
);
assert.ok(
  Array.isArray(builtPostPayload.content) && !("renderedContent" in builtPostPayload),
  "server notion layer should return structured post content without duplicating rendered HTML in the payload",
);
assert.equal(
  serverNotionHelpers.renderPostContent(builtPostPayload, { baseOrigin: "https://example.com" }),
  "<p>Server rendered body</p>",
  "server notion layer should render post HTML on demand from structured content",
);
const queryCacheFetchCounts = {
  database: 0,
  pageQueries: 0,
};
const queryCacheRequestBodies = [];
const queryCacheServerNotion = loadCommonJsModule("server/notion-server.js", [], {
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "query-cache-database",
      SITE_URL: "https://example.com",
      PUBLIC_PAGE_SUMMARY_CACHE_TTL_MS: "120000",
    },
  },
  fetch: async (url, init = {}) => {
    const requestUrl = String(url);

    if (requestUrl.endsWith("/databases/query-cache-database")) {
      queryCacheFetchCounts.database += 1;
      return createJsonResponse({
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
          Excerpt: { id: "excerpt", name: "Excerpt", type: "rich_text" },
          Tags: { id: "tags", name: "Tags", type: "multi_select" },
          Category: {
            id: "category",
            name: "Category",
            type: "select",
            select: {
              options: [
                { name: "Tech", color: "blue" },
                { name: "AI", color: "purple" },
              ],
            },
          },
        },
      });
    }

    if (requestUrl.endsWith("/databases/query-cache-database/query")) {
      queryCacheFetchCounts.pageQueries += 1;
      const requestBody = JSON.parse(init?.body || "{}");
      queryCacheRequestBodies.push(requestBody);
      const requestedCategory = requestBody?.filter?.select?.equals;

      if (requestedCategory === "tech") {
        return createJsonResponse({
          results: [],
          has_more: false,
          next_cursor: null,
        });
      }

      return createJsonResponse({
        results: [
          {
            id: "search-post-alpha",
            properties: {
              Name: {
                id: "title",
                name: "Name",
                type: "title",
                title: [{ plain_text: "Alpha article" }],
              },
              Excerpt: {
                id: "excerpt",
                name: "Excerpt",
                type: "rich_text",
                rich_text: [{ plain_text: "Searchable excerpt" }],
              },
              Tags: {
                id: "tags",
                name: "Tags",
                type: "multi_select",
                multi_select: [{ name: "alpha" }],
              },
              Category: {
                id: "category",
                name: "Category",
                type: "select",
                select: { name: "Tech" },
              },
            },
          },
          {
            id: "search-post-beta",
            properties: {
              Name: {
                id: "title",
                name: "Name",
                type: "title",
                title: [{ plain_text: "Beta article" }],
              },
              Excerpt: {
                id: "excerpt",
                name: "Excerpt",
                type: "rich_text",
                rich_text: [{ plain_text: "Other excerpt" }],
              },
              Tags: {
                id: "tags",
                name: "Tags",
                type: "multi_select",
                multi_select: [{ name: "beta" }],
              },
              Category: {
                id: "category",
                name: "Category",
                type: "select",
                select: { name: "Tech" },
              },
            },
          },
        ],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during filtered query cache test: ${requestUrl}`);
  },
});
const firstCachedQuery = await queryCacheServerNotion.queryPublicPosts({
  category: "Tech",
  search: "alpha",
  page: 1,
});
const secondCachedQuery = await queryCacheServerNotion.queryPublicPosts({
  category: "Tech",
  search: "alpha",
  page: 1,
});
const differentlyCasedQuery = await queryCacheServerNotion.queryPublicPosts({
  category: "tech",
  search: "alpha",
  page: 1,
});
assert.equal(
  queryCacheFetchCounts.database,
  1,
  "server notion layer should reuse one database metadata lookup while caching filtered list queries",
);
assert.equal(
  queryCacheFetchCounts.pageQueries,
  2,
  "server notion layer should reuse cached filtered query results for identical filters without collapsing differently cased category queries",
);
assert.equal(
  queryCacheRequestBodies[0]?.filter?.property,
  "Category",
  "server notion layer should still push category filters down to the Notion database query when possible",
);
assert.equal(
  firstCachedQuery.total,
  1,
  "server notion layer should still apply local search filtering after the category-prefiltered query returns",
);
assert.equal(
  JSON.stringify(firstCachedQuery.categories.map((category) => category.name)),
  JSON.stringify(["全部", "精选", "Tech", "AI"]),
  "server notion layer should include Notion select options in public list category navigation",
);
assert.equal(
  firstCachedQuery.results[0]?.categoryColor?.color,
  "#2979ff",
  "server notion layer should decorate list results with category colors derived from Notion/category config",
);
assert.equal(
  secondCachedQuery.results[0]?.id,
  "search-post-alpha",
  "server notion layer should return the cached filtered result set without changing the query output",
);
assert.equal(
  differentlyCasedQuery.total,
  0,
  "server notion layer should not reuse a cached category query result when the requested category value changes semantically",
);
const dedupedFetchCounts = {
  database: 0,
  page: 0,
  blocks: 0,
};
const dedupedServerNotion = loadCommonJsModule("server/notion-server.js", [], {
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "test-database",
      SITE_URL: "https://example.com",
    },
  },
  fetch: async (url) => {
    const requestUrl = String(url);

    if (requestUrl.endsWith("/databases/test-database")) {
      dedupedFetchCounts.database += 1;
      return createJsonResponse({
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
        },
      });
    }

    if (requestUrl.endsWith("/pages/post-1")) {
      dedupedFetchCounts.page += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return createJsonResponse({
        id: "post-1",
        parent: { database_id: "test-database" },
        properties: {
          Name: {
            id: "title",
            name: "Name",
            type: "title",
            title: [{ plain_text: "Deduped title" }],
          },
        },
      });
    }

    if (requestUrl.includes("/blocks/post-1/children?")) {
      dedupedFetchCounts.blocks += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return createJsonResponse({
        results: [{
          id: "block-1",
          type: "paragraph",
          has_children: false,
          paragraph: {
            rich_text: [{ plain_text: "Deduped body" }],
          },
        }],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during dedupe test: ${requestUrl}`);
  },
});
const [dedupedPostA, dedupedPostB] = await Promise.all([
  dedupedServerNotion.fetchPublicPost("post-1"),
  dedupedServerNotion.fetchPublicPost("post-1"),
]);
assert.strictEqual(
  dedupedPostA,
  dedupedPostB,
  "server notion layer should resolve concurrent post-detail requests through the same in-flight promise",
);
assert.equal(
  dedupedFetchCounts.database,
  1,
  "server notion layer should still reuse the shared database metadata lookup while coalescing concurrent post-detail requests",
);
assert.equal(
  dedupedFetchCounts.page,
  1,
  "server notion layer should fetch the Notion page only once for concurrent requests to the same post",
);
assert.equal(
  dedupedFetchCounts.blocks,
  1,
  "server notion layer should fetch the Notion block tree only once for concurrent requests to the same post",
);
assert.equal(
  dedupedPostA.content?.[0]?.text,
  "Deduped body",
  "server notion layer should still return the mapped block content after coalescing concurrent requests",
);
const encodedPathRequests = [];
const encodedPathServerNotion = loadCommonJsModule("server/notion-server.js", [], {
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "encoded/database",
      SITE_URL: "https://example.com",
    },
  },
  fetch: async (url) => {
    const requestUrl = String(url);
    encodedPathRequests.push(requestUrl);

    if (requestUrl.endsWith("/databases/encoded%2Fdatabase")) {
      return createJsonResponse({
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
        },
      });
    }

    if (requestUrl.endsWith("/pages/unsafe%2Fpost%3Fdebug%3D1")) {
      return createJsonResponse({
        id: "safe-post-id",
        parent: { database_id: "encoded/database" },
        properties: {
          Name: {
            id: "title",
            name: "Name",
            type: "title",
            title: [{ plain_text: "Encoded path title" }],
          },
        },
      });
    }

    if (requestUrl.includes("/blocks/safe-post-id/children?")) {
      return createJsonResponse({
        results: [],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during encoded path test: ${requestUrl}`);
  },
});
const encodedPathPost = await encodedPathServerNotion.fetchPublicPost("unsafe/post?debug=1");
assert.equal(
  encodedPathPost.id,
  "safe-post-id",
  "server notion layer should still map the public page returned for an encoded page id",
);
assert.ok(
  encodedPathRequests.some((requestUrl) => requestUrl.endsWith("/pages/unsafe%2Fpost%3Fdebug%3D1")),
  "server notion layer should encode route-supplied Notion page ids before building API paths",
);
assert.ok(
  encodedPathRequests.some((requestUrl) => requestUrl.includes("/blocks/safe-post-id/children?")),
  "server notion layer should fetch blocks using the canonical Notion page id returned by the API",
);
const retryFetchCounts = {
  database: 0,
  page: 0,
  blocks: 0,
};
let shouldFailNextRetryPageRequest = true;
const retryServerNotion = loadCommonJsModule("server/notion-server.js", [], {
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "retry-database",
      SITE_URL: "https://example.com",
    },
  },
  fetch: async (url) => {
    const requestUrl = String(url);

    if (requestUrl.endsWith("/databases/retry-database")) {
      retryFetchCounts.database += 1;
      return createJsonResponse({
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
        },
      });
    }

    if (requestUrl.endsWith("/pages/retry-post")) {
      retryFetchCounts.page += 1;
      if (shouldFailNextRetryPageRequest) {
        shouldFailNextRetryPageRequest = false;
        return createJsonResponse({
          message: "temporary upstream failure",
          code: "internal_server_error",
        }, {
          status: 500,
        });
      }

      return createJsonResponse({
        id: "retry-post",
        parent: { database_id: "retry-database" },
        properties: {
          Name: {
            id: "title",
            name: "Name",
            type: "title",
            title: [{ plain_text: "Recovered title" }],
          },
        },
      });
    }

    if (requestUrl.includes("/blocks/retry-post/children?")) {
      retryFetchCounts.blocks += 1;
      return createJsonResponse({
        results: [{
          id: "retry-block-1",
          type: "paragraph",
          has_children: false,
          paragraph: {
            rich_text: [{ plain_text: "Recovered body" }],
          },
        }],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during retry test: ${requestUrl}`);
  },
});
await assert.rejects(
  () => retryServerNotion.fetchPublicPost("retry-post"),
  (error) => {
    assert.equal(error?.status, 500);
    return true;
  },
  "server notion layer should surface the original upstream failure for the first failed post-detail request",
);
const recoveredRetryPost = await retryServerNotion.fetchPublicPost("retry-post");
assert.equal(
  retryFetchCounts.page,
  2,
  "server notion layer should clear failed in-flight post-detail requests so the next retry can re-fetch the page",
);
assert.equal(
  retryFetchCounts.blocks,
  1,
  "server notion layer should only fetch block children once after the retry successfully loads the page metadata",
);
assert.equal(
  recoveredRetryPost.title,
  "Recovered title",
  "server notion layer should recover cleanly after a failed in-flight post-detail request",
);
let invalidPostCacheNow = 0;
class InvalidPostCacheDate extends Date {
  static now() {
    return invalidPostCacheNow;
  }
}
const invalidPostCacheFetchCounts = {
  database: 0,
  page: 0,
  blocks: 0,
};
const invalidPostCacheServerNotion = loadCommonJsModule("server/notion-server.js", [], {
  Date: InvalidPostCacheDate,
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "ttl-post-database",
      PUBLIC_POST_CACHE_TTL_MS: "not-a-number",
      SITE_URL: "https://example.com",
    },
  },
  fetch: async (url) => {
    const requestUrl = String(url);

    if (requestUrl.endsWith("/databases/ttl-post-database")) {
      invalidPostCacheFetchCounts.database += 1;
      return createJsonResponse({
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
        },
      });
    }

    if (requestUrl.endsWith("/pages/ttl-post")) {
      invalidPostCacheFetchCounts.page += 1;
      return createJsonResponse({
        id: "ttl-post",
        parent: { database_id: "ttl-post-database" },
        properties: {
          Name: {
            id: "title",
            name: "Name",
            type: "title",
            title: [{ plain_text: `TTL post ${invalidPostCacheFetchCounts.page}` }],
          },
        },
      });
    }

    if (requestUrl.includes("/blocks/ttl-post/children?")) {
      invalidPostCacheFetchCounts.blocks += 1;
      return createJsonResponse({
        results: [],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during invalid post cache TTL test: ${requestUrl}`);
  },
});
await invalidPostCacheServerNotion.fetchPublicPost("ttl-post");
invalidPostCacheNow = 61_000;
await invalidPostCacheServerNotion.fetchPublicPost("ttl-post");
assert.equal(
  invalidPostCacheFetchCounts.page,
  2,
  "server notion layer should fall back to the default post cache TTL when the env value is invalid",
);
let invalidMetadataNow = 0;
class InvalidMetadataDate extends Date {
  static now() {
    return invalidMetadataNow;
  }
}
const invalidMetadataFetchCounts = {
  database: 0,
  query: 0,
};
const invalidMetadataServerNotion = loadCommonJsModule("server/notion-server.js", [], {
  Date: InvalidMetadataDate,
  process: {
    env: {
      ...process.env,
      NOTION_TOKEN: "test-token",
      NOTION_DATABASE_ID: "ttl-metadata-database",
      DATABASE_METADATA_TTL_MS: "not-a-number",
      SITE_URL: "https://example.com",
    },
  },
  fetch: async (url) => {
    const requestUrl = String(url);

    if (requestUrl.endsWith("/databases/ttl-metadata-database")) {
      invalidMetadataFetchCounts.database += 1;
      return createJsonResponse({
        properties: {
          Name: { id: "title", name: "Name", type: "title" },
        },
      });
    }

    if (requestUrl.endsWith("/databases/ttl-metadata-database/query")) {
      invalidMetadataFetchCounts.query += 1;
      return createJsonResponse({
        results: [],
        has_more: false,
        next_cursor: null,
      });
    }

    throw new Error(`Unexpected Notion request during invalid metadata TTL test: ${requestUrl}`);
  },
});
await invalidMetadataServerNotion.queryPublicPosts();
invalidMetadataNow = 301_000;
await invalidMetadataServerNotion.queryPublicPosts();
assert.equal(
  invalidMetadataFetchCounts.database,
  2,
  "server notion layer should fall back to the default database metadata TTL when the env value is invalid",
);
assert.ok(
  !serverNotionJs.includes("鍔″繀鍚屾鏇存柊 js/notion-api.js"),
  "server notion layer should not depend on manually syncing duplicated client helpers",
);
assert.ok(
  !serverNotionJs.includes("queryAllPages"),
  "server notion layer should not expose the whole database as the public content set",
);

}
