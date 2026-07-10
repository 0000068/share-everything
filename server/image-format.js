const IMAGE_SIGNATURE_SNIFF_BYTES = 256;

const DECLARED_IMAGE_TYPE_ALIASES = new Map([
  ["image/apng", "image/png"],
  ["image/avif", "image/avif"],
  ["image/avif-sequence", "image/avif-sequence"],
  ["image/bmp", "image/bmp"],
  ["image/gif", "image/gif"],
  ["image/heic", "image/heic"],
  ["image/heic-sequence", "image/heic-sequence"],
  ["image/heif", "image/heif"],
  ["image/heif-sequence", "image/heif-sequence"],
  ["image/ico", "image/x-icon"],
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/pjpeg", "image/jpeg"],
  ["image/png", "image/png"],
  ["image/tiff", "image/tiff"],
  ["image/vnd.microsoft.icon", "image/x-icon"],
  ["image/webp", "image/webp"],
  ["image/x-icon", "image/x-icon"],
  ["image/x-bmp", "image/bmp"],
  ["image/x-png", "image/png"],
  ["image/x-tiff", "image/tiff"],
]);

function readMediaType(contentType) {
  return String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function normalizeDeclaredImageMediaType(contentType) {
  return DECLARED_IMAGE_TYPE_ALIASES.get(readMediaType(contentType)) || "";
}

function hasPrefix(buffer, bytes) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < bytes.length) {
    return false;
  }

  return bytes.every((byte, index) => buffer[index] === byte);
}

function hasAsciiAt(buffer, offset, expected) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < offset + expected.length) {
    return false;
  }

  return buffer.subarray(offset, offset + expected.length).toString("ascii") === expected;
}

function readIsoBmffBrands(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 16 || !hasAsciiAt(buffer, 4, "ftyp")) {
    return [];
  }

  const size32 = buffer.readUInt32BE(0);
  let boxHeaderSize = 8;
  let declaredBoxSize = size32;
  if (size32 === 1) {
    if (buffer.byteLength < 24) return [];
    const largeSize = buffer.readBigUInt64BE(8);
    if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return [];
    boxHeaderSize = 16;
    declaredBoxSize = Number(largeSize);
  } else if (size32 === 0) {
    declaredBoxSize = buffer.byteLength;
  }
  if (declaredBoxSize < boxHeaderSize + 8) return [];

  const safeBoxSize = Math.min(
    buffer.byteLength,
    declaredBoxSize,
    IMAGE_SIGNATURE_SNIFF_BYTES,
  );
  const brands = [];

  for (let offset = boxHeaderSize; offset + 4 <= safeBoxSize; offset += 4) {
    if (offset === boxHeaderSize + 4) continue;
    brands.push(buffer.subarray(offset, offset + 4).toString("ascii"));
  }

  return brands;
}

function hasWebpSignature(buffer) {
  if (
    !Buffer.isBuffer(buffer)
    || buffer.byteLength < 16
    || !hasAsciiAt(buffer, 0, "RIFF")
    || !hasAsciiAt(buffer, 8, "WEBP")
  ) {
    return false;
  }

  const riffSize = buffer.readUInt32LE(4);
  const firstChunkType = buffer.subarray(12, 16).toString("ascii");
  return riffSize >= 12 && ["VP8 ", "VP8L", "VP8X"].includes(firstChunkType);
}

function hasBmpSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 26 || !hasAsciiAt(buffer, 0, "BM")) {
    return false;
  }

  const declaredFileSize = buffer.readUInt32LE(2);
  const pixelDataOffset = buffer.readUInt32LE(10);
  const dibHeaderSize = buffer.readUInt32LE(14);
  const knownDibHeaderSize = [12, 16, 40, 52, 56, 64, 108, 124].includes(dibHeaderSize);
  return (
    knownDibHeaderSize
    && pixelDataOffset >= 14 + dibHeaderSize
    && (declaredFileSize === 0 || declaredFileSize >= pixelDataOffset)
  );
}

function hasIconSignature(buffer) {
  if (
    !Buffer.isBuffer(buffer)
    || buffer.byteLength < 6
    || !hasPrefix(buffer, [0x00, 0x00, 0x01, 0x00])
  ) {
    return false;
  }

  const imageCount = buffer.readUInt16LE(4);
  return imageCount > 0;
}

function detectRasterImageMediaType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0) return "";

  if (hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (hasPrefix(buffer, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (hasAsciiAt(buffer, 0, "GIF87a") || hasAsciiAt(buffer, 0, "GIF89a")) {
    return "image/gif";
  }
  if (hasWebpSignature(buffer)) {
    return "image/webp";
  }
  if (hasBmpSignature(buffer)) {
    return "image/bmp";
  }
  if (
    hasPrefix(buffer, [0x49, 0x49, 0x2a, 0x00])
    || hasPrefix(buffer, [0x4d, 0x4d, 0x00, 0x2a])
  ) {
    return "image/tiff";
  }
  if (hasIconSignature(buffer)) {
    return "image/x-icon";
  }

  const brands = readIsoBmffBrands(buffer);
  if (brands.includes("avif")) {
    return "image/avif";
  }
  if (brands.includes("avis")) {
    return "image/avif-sequence";
  }
  if (brands.some((brand) => ["heic", "heix"].includes(brand))) {
    return "image/heic";
  }
  if (brands.some((brand) => ["hevc", "hevx"].includes(brand))) {
    return "image/heic-sequence";
  }
  if (brands.includes("mif1")) {
    return "image/heif";
  }
  if (brands.includes("msf1")) {
    return "image/heif-sequence";
  }

  return "";
}

function hasSvgOrXmlSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0) return false;
  const head = buffer.subarray(0, Math.min(IMAGE_SIGNATURE_SNIFF_BYTES, buffer.byteLength))
    .toString("utf8")
    .replace(/^[\uFEFF\s]+/, "")
    .toLowerCase();

  return (
    head.startsWith("<?xml")
    || head.startsWith("<svg")
    || /^<!doctype\s+svg/.test(head)
  );
}

module.exports = {
  DECLARED_IMAGE_TYPE_ALIASES,
  IMAGE_SIGNATURE_SNIFF_BYTES,
  detectRasterImageMediaType,
  hasSvgOrXmlSignature,
  normalizeDeclaredImageMediaType,
  readMediaType,
};
