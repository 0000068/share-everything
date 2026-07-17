const {
  ALL_CATEGORY,
  PUBLIC_CATEGORY_QUERY_MAX_LENGTH,
  PUBLIC_SEARCH_QUERY_MAX_LENGTH,
  queryPublicPosts,
} = require("../server/notion-server");
const { hasCanonicalRequestSearch } = require("../server/canonical-query");
const {
  applyPublicErrorHeaders,
  getPublicContentErrorStatus,
  logServerError,
  rejectUnsupportedReadMethod,
  serializePublicError,
} = require("../server/public-content");
const { createRequestLifecycle } = require("../server/request-lifecycle");

const POSTS_DATA_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const POSTS_DATA_ALLOWED_QUERY_KEYS = new Set(["category", "page", "search"]);
const POSTS_DATA_MAX_PAGE = 10_000;

function readCanonicalPostsQuery(query) {
  const entries = Object.entries(query || {});
  if (
    !entries.every(([key]) => POSTS_DATA_ALLOWED_QUERY_KEYS.has(key))
    || entries.some(([, value]) => typeof value !== "string")
  ) {
    return null;
  }

  const category = query?.category ?? "";
  const search = query?.search ?? "";
  if (
    (Object.hasOwn(query || {}, "category") && (!category || category !== category.trim()))
    || (Object.hasOwn(query || {}, "search") && (!search || search !== search.trim()))
    || category === ALL_CATEGORY
    || category.length > PUBLIC_CATEGORY_QUERY_MAX_LENGTH
    || search.length > PUBLIC_SEARCH_QUERY_MAX_LENGTH
  ) {
    return null;
  }

  const rawPage = query?.page;
  if (rawPage === undefined) {
    return { category, search, page: 1 };
  }
  if (!/^[1-9]\d*$/.test(rawPage) || rawPage === "1") return null;
  const page = Number(rawPage);
  return Number.isSafeInteger(page) && page <= POSTS_DATA_MAX_PAGE
    ? { category, search, page }
    : null;
}

function hasCanonicalPostsRequestUrl(req, query) {
  const entries = [];
  if (query.category) entries.push(["category", query.category]);
  if (query.search) entries.push(["search", query.search]);
  if (query.page > 1) entries.push(["page", String(query.page)]);
  return hasCanonicalRequestSearch(req, entries);
}

module.exports = async function handler(req, res) {
  if (rejectUnsupportedReadMethod(req, res)) {
    return undefined;
  }

  const query = readCanonicalPostsQuery(req.query);
  if (!query || !hasCanonicalPostsRequestUrl(req, query)) {
    applyPublicErrorHeaders(res);
    return res.status(400).json({ error: "Invalid post list query" });
  }

  const lifecycle = createRequestLifecycle(req, res);

  try {
    const data = await queryPublicPosts(query, { signal: lifecycle.signal });
    res.setHeader("Cache-Control", POSTS_DATA_CACHE_CONTROL);
    return res.status(200).json(data);
  } catch (error) {
    if (lifecycle.abortKind === "client") return undefined;
    const status = getPublicContentErrorStatus(error);
    logServerError("Failed to load public post list", error);

    applyPublicErrorHeaders(res, error);
    return res.status(status).json(
      serializePublicError(
        error,
        status === 500 ? "Post list unavailable" : "Post list request failed",
      ),
    );
  } finally {
    lifecycle.dispose();
  }
};

module.exports.__test = Object.freeze({
  POSTS_DATA_MAX_PAGE,
  hasCanonicalPostsRequestUrl,
  readCanonicalPostsQuery,
});
