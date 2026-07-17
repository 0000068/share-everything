import fs from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeExpectedAssetVersion,
  readAssetVersion,
  replaceAssetVersionTokens,
} from "./lib/asset-fingerprint.mjs";

const rootDir = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const currentVersion = readAssetVersion(rootDir);
const expectedVersion = computeExpectedAssetVersion(rootDir, currentVersion);
const transientWriteErrorCodes = new Set(["EACCES", "EBUSY", "EPERM", "UNKNOWN"]);

async function writeTextWithRetry(file, source, { attempts = 10, retryDelayMs = 100 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await writeFile(file, source);
      return;
    } catch (error) {
      if (!transientWriteErrorCodes.has(error?.code) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

function listTextFiles(directory, extension) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTextFiles(absolutePath, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [absolutePath] : [];
  });
}

const targetFiles = [
  path.join(rootDir, "index.html"),
  path.join(rootDir, "blog.html"),
  path.join(rootDir, "post.html"),
  path.join(rootDir, "manifest.webmanifest"),
  ...listTextFiles(path.join(rootDir, "js"), ".js"),
  ...listTextFiles(path.join(rootDir, "css"), ".css"),
  ...listTextFiles(path.join(rootDir, "assets"), ".svg"),
];

const changedFiles = [];
for (const file of targetFiles) {
  const source = fs.readFileSync(file, "utf8");
  const nextSource = replaceAssetVersionTokens(source, expectedVersion);
  if (nextSource === source) continue;
  await writeTextWithRetry(file, nextSource);
  changedFiles.push(path.relative(rootDir, file).replace(/\\/g, "/"));
}

if (changedFiles.length === 0) {
  console.log(`Asset fingerprint already current: ${currentVersion}`);
} else {
  console.log(`Stamped ${expectedVersion}: ${changedFiles.join(", ")}`);
}
