import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeExpectedAssetVersion, readAssetVersion } from "./lib/asset-fingerprint.mjs";

const publicRootFiles = ["index.html", "blog.html", "manifest.webmanifest", "favicon.png", "og-image.jpg"];
const publicDirectories = new Map([
  ["js", new Set([".js"])],
  ["css", new Set([".css"])],
  ["assets", new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg", ".woff2"])],
]);

function collectFiles(root, directory, extensions) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) throw new Error(`Public assets must not be symlinks: ${directory}/${entry.name}`);
    if (entry.name.startsWith(".")) return [];
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(root, relative, extensions);
    return entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase()) ? [relative] : [];
  });
}

export function buildStaticSite(rootDir) {
  const root = fs.realpathSync(rootDir);
  const destination = path.resolve(root, "dist");
  // Verify the exact absolute deletion target and refuse a linked output dir.
  if (path.dirname(destination) !== root || path.basename(destination) !== "dist"
    || (fs.existsSync(destination) && fs.realpathSync(destination) !== destination)) {
    throw new Error("Static output must be the project's own dist directory");
  }
  if (readAssetVersion(root) !== computeExpectedAssetVersion(root)) {
    throw new Error("Asset fingerprint is stale; run npm run assets:sync before building");
  }
  const files = [
    ...publicRootFiles,
    ...[...publicDirectories].flatMap(([directory, extensions]) => collectFiles(root, directory, extensions)),
  ];
  for (const file of files) {
    if (!fs.lstatSync(path.join(root, file)).isFile()) throw new Error(`Invalid public file: ${file}`);
  }
  fs.rmSync(destination, { recursive: true, force: true });
  for (const file of files) {
    const target = path.join(destination, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  return { destination, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildStaticSite(fileURLToPath(new URL("../", import.meta.url)));
  console.log(`Built ${result.files.length} public files in ${result.destination}`);
}
