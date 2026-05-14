const { queryPublicPosts } = require("../server/notion-server");
const {
  applyPublicErrorHeaders,
  getPublicContentErrorStatus,
  logServerError,
  rejectUnsupportedReadMethod,
  readPositiveInteger,
  readQueryString,
  serializePublicError,
} = require("../server/public-content");

const POSTS_DATA_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

module.exports = async function handler(req, res) {
  if (rejectUnsupportedReadMethod(req, res)) {
    return undefined;
  }

  const category = readQueryString(req.query.category);
  const search = readQueryString(req.query.search);
  const page = readPositiveInteger(req.query.page, 1);

  try {
    const data = await queryPublicPosts({ category, search, page });
    res.setHeader("Cache-Control", POSTS_DATA_CACHE_CONTROL);
    return res.status(200).json(data);
  } catch (error) {
    const status = getPublicContentErrorStatus(error);
    logServerError("Failed to load public post list", error);

    applyPublicErrorHeaders(res, error);
    return res.status(status).json(
      serializePublicError(
        error,
        status === 500 ? "Post list unavailable" : "Post list request failed",
      ),
    );
  }
};
