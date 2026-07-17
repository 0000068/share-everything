import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const VERSION_PATTERN = /^(\d{8}-v\d+)(?:-[a-f0-9]{8,12})?$/;
const TEXT_ASSET_EXTENSIONS = new Set([".css", ".js", ".svg", ".webmanifest"]);

export function replaceAssetVersionTokens(source, replacement) {
  return String(source).replace(
    /\b\d{8}-v\d+(?:-[a-f0-9]{8,12})?\b/g,
    replacement,
  );
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolutePath);
    return entry.isFile() ? [absolutePath] : [];
  });
}

export function readAssetVersion(rootDir) {
  const appSource = fs.readFileSync(path.join(rootDir, "js/app.js"), "utf8");
  const match = appSource.match(/const\s+ASSET_VERSION\s*=\s*"([^"]+)";/);
  if (!match || !VERSION_PATTERN.test(match[1])) {
    throw new Error("js/app.js ASSET_VERSION must use YYYYMMDD-vNN with an optional 8..12 lowercase-hex fingerprint");
  }
  return match[1];
}

export function listFingerprintInputs(rootDir) {
  return [
    ...listFiles(path.join(rootDir, "js")),
    ...listFiles(path.join(rootDir, "css")),
    ...listFiles(path.join(rootDir, "assets")),
    path.join(rootDir, "manifest.webmanifest"),
  ]
    .filter((file) => fs.existsSync(file) && fs.statSync(file).isFile())
    .sort((left, right) => left.localeCompare(right, "en"));
}

function normalizeAssetBytes(file, bytes) {
  if (!TEXT_ASSET_EXTENSIONS.has(path.extname(file).toLowerCase())) return bytes;
  return Buffer.from(replaceAssetVersionTokens(bytes.toString("utf8"), "<ASSET_VERSION>"), "utf8");
}

export function computeExpectedAssetVersion(rootDir, assetVersion = readAssetVersion(rootDir)) {
  const match = VERSION_PATTERN.exec(assetVersion);
  if (!match) throw new Error(`Invalid ASSET_VERSION: ${assetVersion}`);
  const hash = createHash("sha256");

  for (const file of listFingerprintInputs(rootDir)) {
    const projectPath = path.relative(rootDir, file).replace(/\\/g, "/");
    const normalizedBytes = normalizeAssetBytes(file, fs.readFileSync(file));
    hash.update(`${projectPath}\0${normalizedBytes.length}\0`, "utf8");
    hash.update(normalizedBytes);
    hash.update("\0", "utf8");
  }

  return `${match[1]}-${hash.digest("hex").slice(0, 12)}`;
}
