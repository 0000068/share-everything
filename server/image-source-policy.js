const crypto = require("node:crypto");

const IMAGE_PROXY_SIGNATURE_PARAMETER = "sig";
const IMAGE_PROXY_SIGNATURE_VERSION = "v1";
const IMAGE_SOURCE_MAX_LENGTH = 4_096;
const IMAGE_PROXY_MIN_SIGNING_SECRET_BYTES = 32;
const IMAGE_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function normalizeSigningSecret(value) {
  const secret = String(value || "").trim();
  return Buffer.byteLength(secret, "utf8") >= IMAGE_PROXY_MIN_SIGNING_SECRET_BYTES
    ? secret
    : "";
}

function readSigningSecret() {
  const dedicatedSecret = String(process.env.IMAGE_PROXY_SIGNING_SECRET || "").trim();
  // An explicitly configured weak secret is a deployment error. Fail closed
  // instead of silently falling back to a different key and masking the typo.
  if (dedicatedSecret) return normalizeSigningSecret(dedicatedSecret);
  return normalizeSigningSecret(process.env.NOTION_TOKEN);
}

function deriveSigningKey(secret) {
  if (!secret) return null;
  return crypto
    .createHash("sha256")
    .update("share-everything:image-proxy:key:v1\0", "utf8")
    .update(secret, "utf8")
    .digest();
}

const IMAGE_PROXY_SIGNING_KEY = deriveSigningKey(readSigningSecret());

function canonicalizeImageSource(candidate, baseUrl) {
  if (typeof candidate !== "string" || !candidate.trim()) return "";

  try {
    const parsed = baseUrl ? new URL(candidate.trim(), baseUrl) : new URL(candidate.trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
    parsed.hash = "";
    return parsed.href.length <= IMAGE_SOURCE_MAX_LENGTH ? parsed.href : "";
  } catch {
    return "";
  }
}

function createImageSourceSignature(candidate) {
  const canonicalSource = canonicalizeImageSource(candidate);
  if (!canonicalSource || !IMAGE_PROXY_SIGNING_KEY) return "";

  return crypto
    .createHmac("sha256", IMAGE_PROXY_SIGNING_KEY)
    .update(`image-source:${IMAGE_PROXY_SIGNATURE_VERSION}\0${canonicalSource}`, "utf8")
    .digest("base64url");
}

function verifyImageSourceSignature(candidate, signature) {
  const normalizedSignature = typeof signature === "string" ? signature : "";
  if (!IMAGE_SIGNATURE_PATTERN.test(normalizedSignature)) return false;

  const expectedSignature = createImageSourceSignature(candidate);
  if (!expectedSignature || expectedSignature.length !== normalizedSignature.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, "ascii"),
    Buffer.from(normalizedSignature, "ascii"),
  );
}

function isImageProxySigningConfigured() {
  return Boolean(IMAGE_PROXY_SIGNING_KEY);
}

function authorizeImageSourceQuery(query, allowedKeys) {
  if (!isImageProxySigningConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Image proxy is not configured",
    };
  }

  const allowed = allowedKeys instanceof Set ? allowedKeys : new Set(allowedKeys || []);
  const entries = Object.entries(query || {});
  if (
    !entries.every(([key]) => allowed.has(key))
    || entries.some(([, value]) => typeof value !== "string")
  ) {
    return {
      ok: false,
      status: 400,
      error: "Invalid image request",
    };
  }

  const sourceValue = typeof query?.src === "string" ? query.src : "";
  const signature = typeof query?.[IMAGE_PROXY_SIGNATURE_PARAMETER] === "string"
    ? query[IMAGE_PROXY_SIGNATURE_PARAMETER]
    : "";
  const source = canonicalizeImageSource(sourceValue);
  if (!source || source !== sourceValue) {
    return {
      ok: false,
      status: 400,
      error: "Invalid image source",
    };
  }
  if (!verifyImageSourceSignature(source, signature)) {
    return {
      ok: false,
      status: 403,
      error: "Image source is not authorized",
    };
  }

  return {
    ok: true,
    source,
  };
}

function withCoverImageSignature(post) {
  if (!post || typeof post !== "object") return post;
  const signature = createImageSourceSignature(post.coverImage);
  if (!signature) return post;

  return {
    ...post,
    coverImageSignature: signature,
  };
}

function withBlockImageSignatures(blocks) {
  if (!Array.isArray(blocks)) return [];

  return blocks.map((block) => {
    if (!block || typeof block !== "object") return block;
    const children = Array.isArray(block.children)
      ? withBlockImageSignatures(block.children)
      : null;
    const signature = block.type === "image"
      ? createImageSourceSignature(block.url)
      : "";

    if (!children && !signature) return block;
    return {
      ...block,
      ...(children ? { children } : {}),
      ...(signature ? { imageProxySignature: signature } : {}),
    };
  });
}

module.exports = {
  IMAGE_PROXY_SIGNATURE_PARAMETER,
  IMAGE_PROXY_SIGNATURE_VERSION,
  IMAGE_PROXY_MIN_SIGNING_SECRET_BYTES,
  IMAGE_SOURCE_MAX_LENGTH,
  authorizeImageSourceQuery,
  canonicalizeImageSource,
  createImageSourceSignature,
  isImageProxySigningConfigured,
  verifyImageSourceSignature,
  withBlockImageSignatures,
  withCoverImageSignature,
};
