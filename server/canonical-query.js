function hasCanonicalRequestSearch(req, entries) {
  if (typeof req?.url !== "string" || !req.url) return false;

  const rawRequestTarget = req.url;
  if (rawRequestTarget.includes("#")) return false;

  try {
    new URL(rawRequestTarget, "https://local.invalid");
  } catch {
    return false;
  }

  const canonicalParams = new URLSearchParams();
  for (const [key, value] of entries || []) {
    if (typeof key !== "string" || typeof value !== "string") return false;
    canonicalParams.append(key, value);
  }
  const canonicalSearch = canonicalParams.toString();
  const queryIndex = rawRequestTarget.indexOf("?");
  const rawSearch = queryIndex >= 0 ? rawRequestTarget.slice(queryIndex + 1) : null;
  return canonicalSearch ? rawSearch === canonicalSearch : rawSearch === null;
}

module.exports = {
  hasCanonicalRequestSearch,
};
