const {
  applyPublicErrorHeaders,
  rejectUnsupportedReadMethod,
  serializePublicError,
} = require("../server/public-content");
const {
  IMAGE_SIGNATURE_SNIFF_BYTES,
  detectRasterImageMediaType,
  hasSvgOrXmlSignature,
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
  readImageContentLength,
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
const { createRequestLifecycle } = require("../server/request-lifecycle");
const { hasCanonicalRequestSearch } = require("../server/canonical-query");

const IMAGE_PROXY_CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";
const IMAGE_PROXY_ALLOWED_QUERY_KEYS = new Set(["src", IMAGE_PROXY_SIGNATURE_PARAMETER]);
const IMAGE_PROXY_RATE_LIMIT_PER_MINUTE = readPositiveIntegerEnv(
  "IMAGE_PROXY_RATE_LIMIT_PER_MINUTE",
  180,
);
const IMAGE_PROXY_RATE_LIMIT_MAX_CLIENTS = readPositiveIntegerEnv(
  "IMAGE_PROXY_RATE_LIMIT_MAX_CLIENTS",
  2_048,
);
const IMAGE_PROXY_MAX_CONCURRENT_REQUESTS = readPositiveIntegerEnv(
  "IMAGE_PROXY_MAX_CONCURRENT_REQUESTS",
  8,
);
const imageProxyRateLimiter = createFixedWindowRateLimiter({
  limit: IMAGE_PROXY_RATE_LIMIT_PER_MINUTE,
  maxEntries: IMAGE_PROXY_RATE_LIMIT_MAX_CLIENTS,
});
const imageProxyConcurrencyGate = createConcurrencyGate(IMAGE_PROXY_MAX_CONCURRENT_REQUESTS);

function applyImageSuccessHeaders(res, contentType, contentLength) {
  res.setHeader("Cache-Control", IMAGE_PROXY_CACHE_CONTROL);
  res.setHeader("Content-Type", contentType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (Number.isSafeInteger(contentLength) && contentLength >= 0) {
    res.setHeader("Content-Length", String(contentLength));
  }
}

function sendImageError(res, status, error, fallbackError, retryAfterSeconds = 0) {
  if (retryAfterSeconds > 0) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
  }
  applyPublicErrorHeaders(res, error);
  return res.status(status).json(serializePublicError(error, fallbackError));
}

function validateImageBytes(buffer) {
  const detectedContentType = detectRasterImageMediaType(buffer);
  if (detectedContentType) return detectedContentType;

  const message = hasSvgOrXmlSignature(buffer)
    ? "Upstream response body contains active SVG/XML content"
    : "Upstream response body is not a supported raster image";
  throw createImageProxyError(message, 415);
}

function pipeValidatedImageResponse(response, res, expectedContentLength = null) {
  const stream = response.stream;
  if (!stream || typeof stream.on !== "function" || typeof res.write !== "function") {
    return null;
  }

  return new Promise((resolve, reject) => {
    const bufferedChunks = [];
    let bufferedBytes = 0;
    let totalBytes = 0;
    let didFlush = false;
    let settled = false;

    function settle(callback, value) {
      if (settled) return;
      settled = true;
      response.cleanup?.();
      callback(value);
    }

    function rejectWith(error) {
      stream.destroy?.(error);
      settle(reject, error);
    }

    function writeChunk(chunk) {
      const canContinue = res.write(chunk);
      if (
        canContinue === false
        && typeof stream.pause === "function"
        && typeof stream.resume === "function"
        && typeof res.once === "function"
      ) {
        stream.pause();
        res.once("drain", () => {
          if (!settled) stream.resume();
        });
      }
    }

    function flushBufferedChunks() {
      if (didFlush) return true;

      let detectedContentType;
      try {
        detectedContentType = validateImageBytes(Buffer.concat(bufferedChunks, bufferedBytes));
      } catch (error) {
        rejectWith(error);
        return false;
      }

      didFlush = true;
      applyImageSuccessHeaders(res, detectedContentType, expectedContentLength);
      res.status(200);
      bufferedChunks.forEach(writeChunk);
      bufferedChunks.length = 0;
      bufferedBytes = 0;
      return true;
    }

    stream.on("data", (chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (
        Number.isSafeInteger(expectedContentLength)
        && expectedContentLength >= 0
        && totalBytes > expectedContentLength
      ) {
        rejectWith(createImageProxyError("Image response exceeds Content-Length", 502));
        return;
      }
      if (totalBytes > IMAGE_PROXY_MAX_BYTES) {
        rejectWith(createImageProxyError("Image is too large", 413));
        return;
      }

      if (!didFlush) {
        const remainingSniffBytes = Math.max(
          0,
          IMAGE_SIGNATURE_SNIFF_BYTES - bufferedBytes,
        );
        const bufferedFromChunk = Math.min(buffer.byteLength, remainingSniffBytes);
        if (bufferedFromChunk > 0) {
          bufferedChunks.push(buffer.subarray(0, bufferedFromChunk));
          bufferedBytes += bufferedFromChunk;
        }
        if (bufferedBytes >= IMAGE_SIGNATURE_SNIFF_BYTES) {
          const validPrefix = flushBufferedChunks();
          if (validPrefix && bufferedFromChunk < buffer.byteLength) {
            writeChunk(buffer.subarray(bufferedFromChunk));
          }
        }
        return;
      }
      writeChunk(buffer);
    });

    stream.on("end", () => {
      if (
        Number.isSafeInteger(expectedContentLength)
        && expectedContentLength >= 0
        && totalBytes !== expectedContentLength
      ) {
        rejectWith(createImageProxyError("Image response length does not match Content-Length", 502));
        return;
      }
      if (settled || !flushBufferedChunks()) return;
      res.end();
      settle(resolve);
    });
    stream.on("error", (error) => settle(reject, error));
    stream.on("aborted", () => settle(
      reject,
      createImageProxyError("Image response was interrupted", 502),
    ));
    stream.on("close", () => {
      if (!stream.readableEnded && !settled) {
        settle(reject, createImageProxyError("Image response closed before completion", 502));
      }
    });
  });
}

async function handler(req, res) {
  if (rejectUnsupportedReadMethod(req, res)) return undefined;

  const authorization = authorizeImageSourceQuery(req.query, IMAGE_PROXY_ALLOWED_QUERY_KEYS);
  if (!authorization.ok) {
    return sendImageError(res, authorization.status, null, authorization.error);
  }
  if (!hasCanonicalRequestSearch(req, [
    ["src", authorization.source],
    [IMAGE_PROXY_SIGNATURE_PARAMETER, req.query[IMAGE_PROXY_SIGNATURE_PARAMETER]],
  ])) {
    return sendImageError(res, 400, null, "Invalid image request URL");
  }

  const rateLimit = imageProxyRateLimiter.consume(readClientKey(req));
  if (!rateLimit.allowed) {
    return sendImageError(
      res,
      429,
      null,
      "Too many image requests",
      rateLimit.retryAfterSeconds,
    );
  }

  const releaseConcurrency = imageProxyConcurrencyGate.tryAcquire();
  if (!releaseConcurrency) {
    return sendImageError(res, 503, null, "Image service busy", 1);
  }

  const lifecycle = createRequestLifecycle(req, res, {
    timeoutMs: IMAGE_PROXY_TIMEOUT_MS,
    timeoutMessage: "Image request timed out",
  });

  try {
    const source = await normalizeSourceUrl(authorization.source, undefined, {
      signal: lifecycle.signal,
    });
    if (!source) {
      return sendImageError(res, 400, null, "Invalid image source");
    }

    const response = await fetchImageResponse(source, {
      signal: lifecycle.signal,
      method: "GET",
    });
    if (!response.ok) {
      response.discardBody?.();
      throw createImageProxyError(`Image request failed: ${response.status}`, response.status);
    }

    const declaredContentType = normalizeDeclaredImageMediaType(
      response.headers.get("content-type"),
    );
    if (!declaredContentType) {
      response.discardBody?.();
      throw createImageProxyError("Upstream response is not a supported raster image", 415);
    }

    const contentLength = readImageContentLength(response);
    if (contentLength !== null && contentLength > IMAGE_PROXY_MAX_BYTES) {
      response.discardBody?.();
      throw createImageProxyError("Image is too large", 413);
    }

    if (req.method === "HEAD") {
      const body = await readBoundedImageBuffer(response);
      const detectedContentType = validateImageBytes(body);
      applyImageSuccessHeaders(res, detectedContentType, body.byteLength);
      return res.status(200).end();
    }

    const streamingResponse = contentLength !== null
      ? pipeValidatedImageResponse(response, res, contentLength)
      : null;
    if (streamingResponse) {
      await streamingResponse;
      return undefined;
    }

    const body = await readBoundedImageBuffer(response);
    const detectedContentType = validateImageBytes(body);
    applyImageSuccessHeaders(res, detectedContentType, body.byteLength);
    return res.status(200).send(body);
  } catch (error) {
    if (lifecycle.abortKind === "client") {
      return undefined;
    }
    const status = getImageProxyErrorStatus(error);
    if (res.headersSent) {
      if (typeof res.destroy === "function") {
        res.destroy();
      } else {
        res.end?.();
      }
      return undefined;
    }
    return sendImageError(
      res,
      status,
      error,
      status === 413 ? "Image too large" : "Image unavailable",
    );
  } finally {
    lifecycle.dispose();
    releaseConcurrency();
  }
}

handler.__test = Object.freeze({
  IMAGE_PROXY_CACHE_CONTROL,
  IMAGE_PROXY_MAX_CONCURRENT_REQUESTS,
  IMAGE_PROXY_RATE_LIMIT_PER_MINUTE,
  applyImageSuccessHeaders,
  pipeValidatedImageResponse,
  validateImageBytes,
});

module.exports = handler;
