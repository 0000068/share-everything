const { fetchPublicPost } = require("../server/notion-server");
const { hasCanonicalRequestSearch } = require("../server/canonical-query");
const {
  applyPublicErrorHeaders,
  getPublicPostErrorStatus,
  logServerError,
  rejectUnsupportedReadMethod,
  readPublicPostId,
  serializePublicError,
} = require("../server/public-content");
const { createRequestLifecycle } = require("../server/request-lifecycle");

const POST_DATA_CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=600";

module.exports = async function handler(req, res) {
  if (rejectUnsupportedReadMethod(req, res)) {
    return undefined;
  }

  const routeId = readPublicPostId(req.query?.id);

  if (
    !routeId
    || req.query?.id !== routeId
    || !hasCanonicalRequestSearch(req, [["id", routeId]])
  ) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(routeId ? 400 : 404).json({
      error: routeId ? "Invalid post query" : "Post not found",
    });
  }

  const lifecycle = createRequestLifecycle(req, res);
  try {
    const post = await fetchPublicPost(routeId, { signal: lifecycle.signal });
    res.setHeader("Cache-Control", POST_DATA_CACHE_CONTROL);
    return res.status(200).json(post);
  } catch (error) {
    if (lifecycle.abortKind === "client") return undefined;
    const status = getPublicPostErrorStatus(error);
    if (status !== 404) {
      logServerError("Failed to load post data", error);
    }

    applyPublicErrorHeaders(res, error);
    return res.status(status).json(
      serializePublicError(
        error,
        status === 404 ? "Post not found" : "Post unavailable",
      ),
    );
  } finally {
    lifecycle.dispose();
  }
};

module.exports.__test = Object.freeze({ POST_DATA_CACHE_CONTROL });
