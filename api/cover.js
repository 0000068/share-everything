const sharp = require("sharp");

const {
  applyPublicErrorHeaders,
  rejectUnsupportedReadMethod,
  serializePublicError,
} = require("../server/public-content");
const {
  detectRasterImageMediaType,
  normalizeDeclaredImageMediaType,
} = require("../server/image-format");
const {
  IMAGE_PROXY_MAX_BYTES,
  IMAGE_PROXY_TIMEOUT_MS,
  createImageProxyError,
  fetchImageResponse,
  getImageProxyErrorStatus,
  normalizeSourceUrl,
  readBoundedImageBuffer,
} = require("../server/image-proxy");
const {
  IMAGE_PROXY_SIGNATURE_PARAMETER,
  authorizeImageSourceQuery,
} = require("../server/image-source-policy");
const {
  createConcurrencyGate,
  createFixedWindowRateLimiter,
  readClientKey,
  readPositiveIntegerEnv,
} = require("../server/request-guard");

const COVER_IMAGE_WIDTHS = Object.freeze([320, 640, 960]);
const COVER_IMAGE_DEFAULT_WIDTH = 640;
const COVER_IMAGE_ASPECT_WIDTH = 16;
const COVER_IMAGE_ASPECT_HEIGHT = 9;
const COVER_IMAGE_MAX_INPUT_PIXELS = 48_000_000;
const COVER_IMAGE_QUALITY = 76;
const COVER_IMAGE_CACHE_CONTROL = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800";
const COVER_IMAGE_ALLOWED_QUERY_KEYS = new Set([
  "format",
  "src",
  IMAGE_PROXY_SIGNATURE_PARAMETER,
  "w",
]);
const COVER_IMAGE_RATE_LIMIT_PER_MINUTE = readPositiveIntegerEnv(
  "COVER_IMAGE_RATE_LIMIT_PER_MINUTE",
  90,
);
const COVER_IMAGE_MAX_CONCURRENT_REQUESTS = readPositiveIntegerEnv(
  "COVER_IMAGE_MAX_CONCURRENT_REQUESTS",
  2,
);
const COVER_IMAGE_FORMATS = Object.freeze({
  avif: {
    contentType: "image/avif",
    transform: (pipeline) => pipeline.avif({ quality: Math.min(COVER_IMAGE_QUALITY, 58), effort: 4 }),
  },
  webp: {
    contentType: "image/webp",
    transform: (pipeline) => pipeline.webp({ quality: COVER_IMAGE_QUALITY, effort: 4 }),
  },
  jpeg: {
    contentType: "image/jpeg",
    transform: (pipeline) => pipeline.jpeg({ quality: COVER_IMAGE_QUALITY, mozjpeg: true }),
  },
});
const COVER_FORMAT_PREFERENCE = Object.freeze(["avif", "webp", "jpeg"]);
const coverImageRateLimiter = createFixedWindowRateLimiter({
  limit: COVER_IMAGE_RATE_LIMIT_PER_MINUTE,
});
const coverImageConcurrencyGate = createConcurrencyGate(COVER_IMAGE_MAX_CONCURRENT_REQUESTS);

function readCoverWidth(value) {
  if (value === undefined) return COVER_IMAGE_DEFAULT_WIDTH;
  if (typeof value !== "string" || value !== value.trim() || !/^\d+$/.test(value)) {
    return null;
  }

  const width = Number(value);
  return COVER_IMAGE_WIDTHS.includes(width) && value === String(width) ? width : null;
}

function readCoverFormat(value) {
  if (value === undefined) return null;
  if (
    typeof value !== "string"
    || !value
    || value !== value.trim()
    || value !== value.toLowerCase()
  ) {
    return undefined;
  }
  return Object.hasOwn(COVER_IMAGE_FORMATS, value) ? value : undefined;
}

function readAcceptQuality(parameters) {
  const qualityParameter = parameters.find((parameter) => (
    parameter.trim().toLowerCase().startsWith("q=")
  ));
  if (!qualityParameter) return 1;

  const quality = Number(qualityParameter.split("=")[1]);
  return Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0;
}

function parseAcceptHeader(accept) {
  return String(accept || "")
    .split(",")
    .map((entry, index) => {
      const [mediaRange, ...parameters] = entry.split(";");
      return {
        index,
        mediaRange: mediaRange.trim().toLowerCase(),
        quality: readAcceptQuality(parameters),
      };
    })
    .filter((entry) => entry.mediaRange);
}

function readAcceptedQuality(entries, mimeType) {
  const [type] = mimeType.split("/");
  const candidates = entries
    .filter((entry) => (
      entry.mediaRange === mimeType
      || entry.mediaRange === `${type}/*`
      || entry.mediaRange === "*/*"
    ))
    .map((entry) => ({
      ...entry,
      specificity: entry.mediaRange === mimeType ? 2 : entry.mediaRange === `${type}/*` ? 1 : 0,
    }))
    .sort((left, right) => (
      right.specificity - left.specificity
      || left.index - right.index
    ));

  return candidates[0]?.quality ?? 0;
}

function selectCoverFormat(req) {
  const requestedFormat = readCoverFormat(req.query?.format);
  if (requestedFormat === undefined) return null;
  if (requestedFormat !== null) {
    return { format: requestedFormat, variesByAccept: false };
  }

  const accept = String(req.headers?.accept || "").trim();
  if (!accept) return { format: "jpeg", variesByAccept: true };
  const accepted = parseAcceptHeader(accept);
  const rankedFormats = COVER_FORMAT_PREFERENCE
    .map((format, preference) => ({
      format,
      preference,
      quality: readAcceptedQuality(accepted, COVER_IMAGE_FORMATS[format].contentType),
    }))
    .filter((candidate) => candidate.quality > 0)
    .sort((left, right) => (
      right.quality - left.quality
      || left.preference - right.preference
    ));

  return rankedFormats.length > 0
    ? { format: rankedFormats[0].format, variesByAccept: true }
    : { format: "", variesByAccept: true };
}

function getCoverHeight(width) {
  return Math.round((width * COVER_IMAGE_ASPECT_HEIGHT) / COVER_IMAGE_ASPECT_WIDTH);
}

async function optimizeCoverImage(body, { width, format }) {
  const outputFormat = COVER_IMAGE_FORMATS[format];
  const pipeline = sharp(body, {
    failOn: "truncated",
    limitInputPixels: COVER_IMAGE_MAX_INPUT_PIXELS,
  })
    .rotate()
    .resize({
      width,
      height: getCoverHeight(width),
      fit: "cover",
      position: sharp.strategy.attention,
    });

  return outputFormat.transform(pipeline).toBuffer();
}

function applyCoverSuccessHeaders(res, outputFormat, {
  contentLength,
  variesByAccept,
} = {}) {
  res.setHeader("Cache-Control", COVER_IMAGE_CACHE_CONTROL);
  res.setHeader("Content-Type", outputFormat.contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (variesByAccept) res.setHeader("Vary", "Accept");
  if (Number.isSafeInteger(contentLength) && contentLength >= 0) {
    res.setHeader("Content-Length", String(contentLength));
  }
}

function sendCoverError(res, status, error, fallbackError, retryAfterSeconds = 0) {
  if (retryAfterSeconds > 0) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
  }
  applyPublicErrorHeaders(res, error);
  return res.status(status).json(serializePublicError(error, fallbackError));
}

async function loadSourceImage(source, { signal }) {
  const response = await fetchImageResponse(source, { signal, method: "GET" });
  if (!response.ok) {
    response.discardBody?.();
    throw createImageProxyError(`Image request failed: ${response.status}`, response.status);
  }

  if (!normalizeDeclaredImageMediaType(response.headers.get("content-type"))) {
    response.discardBody?.();
    throw createImageProxyError("Upstream response is not a supported raster image", 415);
  }
  return response;
}

async function handler(req, res) {
  if (rejectUnsupportedReadMethod(req, res)) return undefined;

  const width = readCoverWidth(req.query?.w);
  const selectedFormat = selectCoverFormat(req);
  if (!width || !selectedFormat) {
    return sendCoverError(res, 400, null, "Invalid cover image request");
  }
  if (!selectedFormat.format) {
    return sendCoverError(res, 406, null, "No acceptable cover image format");
  }

  const authorization = authorizeImageSourceQuery(req.query, COVER_IMAGE_ALLOWED_QUERY_KEYS);
  if (!authorization.ok) {
    return sendCoverError(res, authorization.status, null, authorization.error);
  }

  const rateLimit = coverImageRateLimiter.consume(readClientKey(req));
  if (!rateLimit.allowed) {
    return sendCoverError(
      res,
      429,
      null,
      "Too many cover image requests",
      rateLimit.retryAfterSeconds,
    );
  }

  const releaseConcurrency = coverImageConcurrencyGate.tryAcquire();
  if (!releaseConcurrency) {
    return sendCoverError(res, 503, null, "Cover image service busy", 1);
  }

  const outputFormat = COVER_IMAGE_FORMATS[selectedFormat.format];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_PROXY_TIMEOUT_MS);

  try {
    const source = await normalizeSourceUrl(authorization.source, undefined, {
      signal: controller.signal,
    });
    if (!source) {
      return sendCoverError(res, 400, null, "Invalid cover image source");
    }

    const response = await loadSourceImage(source, {
      signal: controller.signal,
    });
    const body = await readBoundedImageBuffer(response);
    if (body.byteLength > IMAGE_PROXY_MAX_BYTES) {
      throw createImageProxyError("Image is too large", 413);
    }
    if (!detectRasterImageMediaType(body)) {
      throw createImageProxyError("Upstream response body is not a supported raster image", 415);
    }

    let optimizedBody;
    try {
      optimizedBody = await optimizeCoverImage(body, {
        width,
        format: selectedFormat.format,
      });
    } catch (error) {
      throw createImageProxyError("Image could not be optimized", 415, error);
    }

    applyCoverSuccessHeaders(res, outputFormat, {
      contentLength: optimizedBody.byteLength,
      variesByAccept: selectedFormat.variesByAccept,
    });
    if (req.method === "HEAD") {
      return res.status(200).end();
    }
    return res.status(200).send(optimizedBody);
  } catch (error) {
    const status = getImageProxyErrorStatus(error);
    return sendCoverError(
      res,
      status,
      error,
      status === 413 ? "Image too large" : "Cover image unavailable",
    );
  } finally {
    clearTimeout(timeoutId);
    releaseConcurrency();
  }
}

handler.__test = Object.freeze({
  COVER_IMAGE_MAX_CONCURRENT_REQUESTS,
  COVER_IMAGE_RATE_LIMIT_PER_MINUTE,
  applyCoverSuccessHeaders,
  parseAcceptHeader,
  readAcceptedQuality,
  readCoverFormat,
  readCoverWidth,
  selectCoverFormat,
});

module.exports = handler;
