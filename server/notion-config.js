const fs = require("node:fs");
const path = require("node:path");

const SAFE_FALLBACK_SITE_ORIGIN = "https://example.com";

function readCsvEnv(names, defaults = []) {
  const keys = Array.isArray(names) ? names : [names];

  for (const key of keys) {
    const rawValue = process.env[key];
    if (typeof rawValue !== "string") {
      continue;
    }

    const values = rawValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (values.length > 0) {
      return values;
    }
  }

  return Array.isArray(defaults) ? defaults.slice() : [];
}

function normalizeName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeNotionId(value) {
  return typeof value === "string" ? value.replace(/-/g, "").toLowerCase() : "";
}

function encodeNotionPathId(value) {
  const normalized = typeof value === "string" ? value.trim() : String(value ?? "");
  return encodeURIComponent(normalized);
}

function normalizePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeNonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readSiteConfig() {
  try {
    const configPath = path.resolve(__dirname, "../site.config.json");
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function readConfiguredSiteOrigin(config = {}) {
  return typeof config.siteUrl === "string" ? config.siteUrl : "";
}

function normalizeSiteOrigin(value, fallback = SAFE_FALLBACK_SITE_ORIGIN) {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : fallback;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("SITE_URL must use http or https");
    }
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.href.replace(/\/+$/, "");
  } catch (error) {
    if (candidate !== fallback) {
      console.warn(`Invalid SITE_URL "${candidate}", falling back to ${fallback}.`);
    }
    return fallback.replace(/\/+$/, "");
  }
}

function createAsyncLimiter(limit) {
  const safeLimit = Math.max(1, Math.trunc(normalizePositiveNumber(limit, 1)));
  let activeCount = 0;
  const pendingResolvers = [];

  return async function runWithLimit(task) {
    if (activeCount >= safeLimit) {
      await new Promise((resolve) => {
        pendingResolvers.push(resolve);
      });
    }

    activeCount += 1;

    try {
      return await task();
    } finally {
      activeCount -= 1;
      const next = pendingResolvers.shift();
      if (next) {
        next();
      }
    }
  };
}

module.exports = {
  SAFE_FALLBACK_SITE_ORIGIN,
  createAsyncLimiter,
  encodeNotionPathId,
  normalizeName,
  normalizeNonNegativeNumber,
  normalizeNotionId,
  normalizePositiveNumber,
  normalizeSiteOrigin,
  readConfiguredSiteOrigin,
  readCsvEnv,
  readSiteConfig,
};
