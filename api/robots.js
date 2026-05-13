const { getSiteOrigin } = require("../server/notion-server");
const { rejectUnsupportedReadMethod } = require("../server/public-content");

function buildRobotsText(siteOrigin = getSiteOrigin()) {
  const origin = String(siteOrigin || "").replace(/\/+$/, "");
  return `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`;
}

module.exports = async function handler(req, res) {
  if (rejectUnsupportedReadMethod(req, res)) {
    return undefined;
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(buildRobotsText());
};
