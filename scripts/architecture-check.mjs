import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const sourceRoots = ["api", "js", "server"];

function toProjectPath(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(absolutePath);
    return entry.isFile() && /\.[cm]?js$/i.test(entry.name) ? [absolutePath] : [];
  });
}

const sourceFiles = sourceRoots.flatMap((root) => listJavaScriptFiles(path.join(rootDir, root)));
const sourceFileSet = new Set(sourceFiles.map(toProjectPath));

function extractStaticSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];

  patterns.forEach((pattern) => {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  });
  return [...new Set(specifiers)];
}

function resolveProjectSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const pathSpecifier = specifier.split(/[?#]/, 1)[0];
  const unresolved = path.resolve(path.dirname(fromFile), pathSpecifier);
  const candidates = [
    unresolved,
    `${unresolved}.js`,
    `${unresolved}.cjs`,
    `${unresolved}.mjs`,
    path.join(unresolved, "index.js"),
    path.join(unresolved, "index.cjs"),
    path.join(unresolved, "index.mjs"),
  ];

  return candidates.find((candidate) => (
    fs.existsSync(candidate) && fs.statSync(candidate).isFile()
  )) || null;
}

const dependencyGraph = new Map();
const boundaryErrors = [];

sourceFiles.forEach((absoluteFile) => {
  const from = toProjectPath(absoluteFile);
  const source = fs.readFileSync(absoluteFile, "utf8");
  const localSpecifiers = extractStaticSpecifiers(source)
    .filter((specifier) => specifier.startsWith("."));
  const resolvedSpecifiers = localSpecifiers
    .map((specifier) => ({
      resolved: resolveProjectSpecifier(absoluteFile, specifier),
      specifier,
    }));
  resolvedSpecifiers
    .filter(({ resolved }) => !resolved)
    .forEach(({ specifier }) => {
      boundaryErrors.push(`${from} imports missing local module ${specifier}`);
    });
  resolvedSpecifiers
    .filter(({ resolved }) => resolved)
    .forEach(({ resolved, specifier }) => {
      const target = toProjectPath(resolved);
      if (target.startsWith("../")) {
        boundaryErrors.push(`${from} imports outside the project root via ${specifier}`);
      } else if (target.startsWith("scripts/")) {
        boundaryErrors.push(`${from} must not depend on build/test tooling ${target}`);
      }
    });
  const dependencies = resolvedSpecifiers
    .map(({ resolved }) => resolved)
    .filter(Boolean)
    .map(toProjectPath)
    .filter((dependency) => sourceFileSet.has(dependency));

  dependencyGraph.set(from, dependencies);
  dependencies.forEach((target) => {
    if (from.startsWith("js/") && !target.startsWith("js/")) {
      boundaryErrors.push(`${from} must not depend on non-browser module ${target}`);
    }
    if (from.startsWith("server/") && target.startsWith("api/")) {
      boundaryErrors.push(`${from} must not depend on transport handler ${target}`);
    }
    if (from.startsWith("api/") && target.startsWith("api/") && target !== from) {
      boundaryErrors.push(`${from} must use a shared service instead of importing handler ${target}`);
    }
  });
});

const visited = new Set();
const active = new Set();
const stack = [];
const cycles = [];

function visit(file) {
  if (active.has(file)) {
    const cycleStart = stack.indexOf(file);
    cycles.push([...stack.slice(cycleStart), file]);
    return;
  }
  if (visited.has(file)) return;

  visited.add(file);
  active.add(file);
  stack.push(file);
  (dependencyGraph.get(file) || []).forEach(visit);
  stack.pop();
  active.delete(file);
}

dependencyGraph.forEach((_, file) => visit(file));

if (boundaryErrors.length > 0 || cycles.length > 0) {
  boundaryErrors.forEach((message) => console.error(`Architecture boundary violation: ${message}`));
  cycles.forEach((cycle) => console.error(`Circular dependency: ${cycle.join(" -> ")}`));
  process.exit(1);
}

console.log(`Architecture check passed (${sourceFiles.length} modules, no boundary violations or cycles).`);
