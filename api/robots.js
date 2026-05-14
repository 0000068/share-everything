const { getSiteOrigin } = require("../server/notion-server");
const { rejectUnsupportedReadMethod } = require("../server/public-content");

const ROBOTS_CACHE_CONTROL = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";

function buildRobotsText(siteOrigin = getSiteOrigin()) {
  const origin = String(siteOrigin || "").replace(/\/+$/, "");
  return `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`;
}

module.exports = async function handler(req, res) {
  if (rejectUnsupportedReadMethod(req, res)) {
    return undefined;
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", ROBOTS_CACHE_CONTROL);
  return res.status(200).send(buildRobotsText());
};
