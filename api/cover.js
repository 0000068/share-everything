const sharp = require("sharp");

const imageProxyHandler = require("./image");
const {
  rejectUnsupportedReadMethod,
  readQueryString,
  serializePublicError,
} = require("../server/public-content");

const {
  createImageProxyError,
  fetchImageResponse,
  hasSvgOrXmlSignature,
  IMAGE_PROXY_MAX_BYTES,
  IMAGE_PROXY_TIMEOUT_MS,
  isImageContentType,
  normalizeSourceUrl,
  readBoundedImageBuffer,
} = imageProxyHandler.__internal;

const COVER_IMAGE_WIDTHS = Object.freeze([320, 640, 960]);
const COVER_IMAGE_DEFAULT_WIDTH = 640;
const COVER_IMAGE_ASPECT_WIDTH = 16;
const COVER_IMAGE_ASPECT_HEIGHT = 9;
const COVER_IMAGE_MAX_INPUT_PIXELS = 48_000_000;
const COVER_IMAGE_QUALITY = 76;
const COVER_IMAGE_CACHE_CONTROL = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800";
const COVER_IMAGE_FORMATS = Object.freeze({
  avif: {
    contentType: "image/avif",
    transform: (pipeline) => pipeline.avif({ quality: Math.min(COVER_IMAGE_QUALITY, 58), effort: 4 }),
  },
  jpeg: {
    contentType: "image/jpeg",
    transform: (pipeline) => pipeline.jpeg({ quality: COVER_IMAGE_QUALITY, mozjpeg: true }),
  },
  webp: {
    contentType: "image/webp",
    transform: (pipeline) => pipeline.webp({ quality: COVER_IMAGE_QUALITY, effort: 4 }),
  },
});

function readCoverWidth(value) {
  const rawWidth = readQueryString(value);
  if (!rawWidth) return COVER_IMAGE_DEFAULT_WIDTH;
  if (!/^\d+$/.test(rawWidth)) return null;

  const width = Number(rawWidth);
  return COVER_IMAGE_WIDTHS.includes(width) ? width : null;
}

function readCoverFormat(value) {
  const format = readQueryString(value).toLowerCase();
  if (!format || format === "auto") return null;
  if (format === "jpg") return "jpeg";
  return Object.hasOwn(COVER_IMAGE_FORMATS, format) ? format : undefined;
}

function readAcceptQuality(mediaRange) {
  const parameters = String(mediaRange || "").split(";").slice(1);
  const qualityParameter = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith("q="));
  if (!qualityParameter) return 1;

  const quality = Number(qualityParameter.split("=")[1]);
  return Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0;
}

function acceptsExplicitImageMime(accept, mimeType) {
  const normalizedMimeType = String(mimeType || "").toLowerCase();
  return String(accept || "")
    .toLowerCase()
    .split(",")
    .some((mediaRange) => mediaRange.split(";")[0].trim() === normalizedMimeType && readAcceptQuality(mediaRange) > 0);
}

function selectCoverFormat(req) {
  const requestedFormat = readCoverFormat(req.query.format);
  if (requestedFormat !== null) {
    return requestedFormat;
  }

  const accept = String(req.headers?.accept || "").toLowerCase();
  if (acceptsExplicitImageMime(accept, "image/avif")) return "avif";
  if (acceptsExplicitImageMime(accept, "image/webp")) return "webp";
  return "jpeg";
}

function getCoverHeight(width) {
  return Math.round((width * COVER_IMAGE_ASPECT_HEIGHT) / COVER_IMAGE_ASPECT_WIDTH);
}

async function optimizeCoverImage(body, { width, format }) {
  const height = getCoverHeight(width);
  const outputFormat = COVER_IMAGE_FORMATS[format];
  const pipeline = sharp(body, {
    failOn: "truncated",
    limitInputPixels: COVER_IMAGE_MAX_INPUT_PIXELS,
  })
    .rotate()
    .resize({
      width,
      height,
      fit: "cover",
      position: sharp.strategy.attention,
    });

  return outputFormat.transform(pipeline).toBuffer();
}

async function loadSourceImage(source, { signal, method }) {
  const response = await fetchImageResponse(source, { signal, method });

  if (!response.ok) {
    response.discardBody?.();
    throw createImageProxyError(`Image request failed: ${response.status}`, response.status);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!isImageContentType(contentType)) {
    response.discardBody?.();
    throw createImageProxyError("Upstream response is not an image", 415);
  }

  return response;
}

async function handler(req, res) {
  if (rejectUnsupportedReadMethod(req, res)) {
    return undefined;
  }

  const source = await normalizeSourceUrl(readQueryString(req.query.src));
  const width = readCoverWidth(req.query.w);
  const format = selectCoverFormat(req);

  if (!source || !width || !format) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(400).json({ error: "Invalid cover image request" });
  }

  const outputFormat = COVER_IMAGE_FORMATS[format];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_PROXY_TIMEOUT_MS);

  try {
    const response = await loadSourceImage(source, {
      signal: controller.signal,
      method: req.method === "HEAD" ? "HEAD" : "GET",
    });

    res.setHeader("Cache-Control", COVER_IMAGE_CACHE_CONTROL);
    res.setHeader("Content-Type", outputFormat.contentType);
    res.setHeader("Vary", "Accept");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method === "HEAD") {
      response.discardBody?.();
      return res.status(200).end();
    }

    const body = await readBoundedImageBuffer(response);
    if (body.byteLength > IMAGE_PROXY_MAX_BYTES) {
      throw createImageProxyError("Image is too large", 413);
    }
    if (hasSvgOrXmlSignature(body)) {
      throw createImageProxyError("Upstream response body looks like SVG/XML despite the declared image MIME type", 415);
    }

    let optimizedBody;
    try {
      optimizedBody = await optimizeCoverImage(body, { width, format });
    } catch (error) {
      throw createImageProxyError("Image could not be optimized", 415, error);
    }

    res.setHeader("Content-Length", String(optimizedBody.byteLength));
    return res.status(200).send(optimizedBody);
  } catch (error) {
    const status = Number(error?.status) || (error?.name === "AbortError" ? 504 : 502);
    res.setHeader("Cache-Control", "no-store");
    return res.status(status).json(
      serializePublicError(error, status === 413 ? "Image too large" : "Cover image unavailable"),
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = handler;
