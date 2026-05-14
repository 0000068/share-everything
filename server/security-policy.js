const crypto = require("node:crypto");

const DEFAULT_SCRIPT_SOURCE = "'self'";
const FRAME_ANCESTORS_DIRECTIVE = "frame-ancestors 'none'";
const STYLE_SOURCES = [
  "'self'",
  "'unsafe-inline'",
  "https://fonts.googleapis.com",
  "https://fonts.googleapis.cn",
];
const FONT_SOURCES = [
  "'self'",
  "https://fonts.gstatic.com",
  "https://fonts.gstatic.cn",
  "data:",
];
const FRAME_SOURCES = [
  "'self'",
  "https://www.youtube.com",
  "https://youtube.com",
  "https://player.bilibili.com",
  "https://player.vimeo.com",
  "https://codepen.io",
  "https://www.figma.com",
  "https://www.loom.com",
];

function normalizeNonce(scriptNonce) {
  return typeof scriptNonce === "string" ? scriptNonce.trim() : "";
}

function buildScriptSource(scriptNonce = "") {
  const nonce = normalizeNonce(scriptNonce);
  return nonce ? `${DEFAULT_SCRIPT_SOURCE} 'nonce-${nonce}'` : DEFAULT_SCRIPT_SOURCE;
}

function buildContentSecurityPolicy({ scriptNonce = "", includeFrameAncestors = true } = {}) {
  const scriptSource = buildScriptSource(scriptNonce);
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSource}`,
    `script-src-elem ${scriptSource}`,
    "script-src-attr 'none'",
    `style-src ${STYLE_SOURCES.join(" ")}`,
    "img-src 'self' https: data: blob:",
    `font-src ${FONT_SOURCES.join(" ")}`,
    "connect-src 'self'",
    `frame-src ${FRAME_SOURCES.join(" ")}`,
    "media-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
  ];

  if (includeFrameAncestors) {
    directives.push(FRAME_ANCESTORS_DIRECTIVE);
  }

  return directives.join("; ");
}

function buildStaticContentSecurityPolicy() {
  return buildContentSecurityPolicy({ includeFrameAncestors: false });
}

function createCspNonce() {
  return crypto.randomBytes(16).toString("base64");
}

function applyHtmlSecurityHeaders(res, options = {}) {
  res.setHeader("Content-Security-Policy", buildContentSecurityPolicy(options));
  res.setHeader("X-Frame-Options", "DENY");
}

module.exports = {
  FRAME_ANCESTORS_DIRECTIVE,
  applyHtmlSecurityHeaders,
  buildContentSecurityPolicy,
  buildScriptSource,
  buildStaticContentSecurityPolicy,
  createCspNonce,
};
