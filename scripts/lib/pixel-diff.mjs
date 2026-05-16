import assert from "node:assert/strict";
import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let crcTable = null;

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    return crc >>> 0;
  });
}

function crc32(buffer) {
  crcTable ||= makeCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readPng(buffer) {
  assert.ok(Buffer.isBuffer(buffer), "PNG input must be a Buffer");
  assert.ok(buffer.subarray(0, 8).equals(PNG_SIGNATURE), "PNG signature is invalid");

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  assert.equal(bitDepth, 8, "Only 8-bit PNG images are supported");
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  assert.ok(bytesPerPixel > 0, "Only RGB/RGBA PNG images are supported");
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * bytesPerPixel;
  const raw = Buffer.alloc(width * height * bytesPerPixel);
  let sourceOffset = 0;
  let targetOffset = 0;
  let previousRow = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = inflated.subarray(sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
    const out = raw.subarray(targetOffset, targetOffset + stride);

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? out[x - bytesPerPixel] : 0;
      const up = previousRow[x] || 0;
      const upLeft = x >= bytesPerPixel ? previousRow[x - bytesPerPixel] || 0 : 0;
      let value = row[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) value += paethPredictor(left, up, upLeft);
      else assert.equal(filter, 0, "Unsupported PNG row filter");
      out[x] = value & 0xff;
    }

    previousRow = Buffer.from(out);
    targetOffset += stride;
  }

  return { width, height, colorType, bytesPerPixel, data: toRgba(raw, width, height, bytesPerPixel) };
}

function paethPredictor(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDelta = Math.abs(estimate - left);
  const upDelta = Math.abs(estimate - up);
  const upLeftDelta = Math.abs(estimate - upLeft);
  if (leftDelta <= upDelta && leftDelta <= upLeftDelta) return left;
  return upDelta <= upLeftDelta ? up : upLeft;
}

function toRgba(raw, width, height, bytesPerPixel) {
  if (bytesPerPixel === 4) return Buffer.from(raw);
  const rgba = Buffer.alloc(width * height * 4);
  for (let source = 0, target = 0; source < raw.length; source += 3, target += 4) {
    rgba[target] = raw[source];
    rgba[target + 1] = raw[source + 1];
    rgba[target + 2] = raw[source + 2];
    rgba[target + 3] = 255;
  }
  return rgba;
}

function blendAgainstWhite(channel, alpha) {
  return 255 + (channel - 255) * (alpha / 255);
}

function yiqDelta(actual, baseline, offset) {
  const alphaActual = actual[offset + 3];
  const alphaBaseline = baseline[offset + 3];
  const r1 = blendAgainstWhite(actual[offset], alphaActual);
  const g1 = blendAgainstWhite(actual[offset + 1], alphaActual);
  const b1 = blendAgainstWhite(actual[offset + 2], alphaActual);
  const r2 = blendAgainstWhite(baseline[offset], alphaBaseline);
  const g2 = blendAgainstWhite(baseline[offset + 1], alphaBaseline);
  const b2 = blendAgainstWhite(baseline[offset + 2], alphaBaseline);
  const r = r1 - r2;
  const g = g1 - g2;
  const b = b1 - b2;
  const y = r * 0.29889531 + g * 0.58662247 + b * 0.11448223;
  const i = r * 0.59597799 - g * 0.27417610 - b * 0.32180189;
  const q = r * 0.21147017 - g * 0.52261711 + b * 0.31114694;
  return 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function writePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (stride + 1);
    raw[rawOffset] = 0;
    data.copy(raw, rawOffset + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk("IHDR", ihdr),
    createChunk("IDAT", zlib.deflateSync(raw)),
    createChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function diffPng(actualBuffer, baselineBuffer, { threshold = 0.05 } = {}) {
  const actual = readPng(actualBuffer);
  const baseline = readPng(baselineBuffer);
  assert.equal(actual.width, baseline.width, "PNG widths must match");
  assert.equal(actual.height, baseline.height, "PNG heights must match");

  const totalPixels = actual.width * actual.height;
  const maxDelta = 35215 * threshold * threshold;
  const diffData = Buffer.alloc(actual.data.length);
  let differentPixels = 0;

  for (let offset = 0; offset < actual.data.length; offset += 4) {
    if (yiqDelta(actual.data, baseline.data, offset) > maxDelta) {
      differentPixels += 1;
      diffData[offset] = 255;
      diffData[offset + 1] = 40;
      diffData[offset + 2] = 40;
      diffData[offset + 3] = 255;
    } else {
      diffData[offset] = Math.round(actual.data[offset] * 0.35 + 255 * 0.65);
      diffData[offset + 1] = Math.round(actual.data[offset + 1] * 0.35 + 255 * 0.65);
      diffData[offset + 2] = Math.round(actual.data[offset + 2] * 0.35 + 255 * 0.65);
      diffData[offset + 3] = 160;
    }
  }

  return {
    width: actual.width,
    height: actual.height,
    differentPixels,
    totalPixels,
    diffRatio: differentPixels / totalPixels,
    diffBuffer: writePng({ width: actual.width, height: actual.height, data: diffData }),
  };
}
