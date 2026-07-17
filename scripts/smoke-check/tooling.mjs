import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDotEnvSource } from "../lib/dotenv.mjs";
import { runNamedCleanupTasks } from "../lib/cleanup-tasks.mjs";
import { replaceVisualBaselines } from "../lib/visual-baseline-store.mjs";
import {
  computeExpectedAssetVersion,
  replaceAssetVersionTokens,
} from "../lib/asset-fingerprint.mjs";
import { buildMobileFallbacks } from "../build-mobile-fallbacks.mjs";
import sharp from "sharp";

function toObject(entries) {
  return Object.fromEntries(entries.map(({ key, value }) => [key, value]));
}

export async function runToolingChecks({ assert }) {
  const cleanupCalls = [];
  await assert.rejects(
    runNamedCleanupTasks([
      {
        name: "browser",
        run: async () => {
          cleanupCalls.push("browser");
          throw new Error("profile lock");
        },
      },
      {
        name: "local server",
        run: async () => {
          cleanupCalls.push("local server");
        },
      },
    ], "visual cleanup"),
    (error) => (
      error instanceof AggregateError
      && error.errors.length === 1
      && error.message.includes("browser")
    ),
    "cleanup aggregation should report the failing resource",
  );
  assert.deepEqual(
    cleanupCalls.sort(),
    ["browser", "local server"],
    "a browser cleanup failure must not skip local-server shutdown",
  );

  const baselineFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "share-everything-baselines-"));
  try {
    const baselineNames = ["one", "two", "three"];
    const oldPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(10_000, 1),
    ]);
    const newPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(10_000, 2),
    ]);
    baselineNames.forEach((name) => fs.writeFileSync(path.join(baselineFixtureRoot, `${name}.png`), oldPng));
    let renameCount = 0;
    const faultyFileSystem = new Proxy(fs, {
      get(target, property) {
        if (property !== "renameSync") return target[property];
        return (...args) => {
          renameCount += 1;
          if (renameCount === 5) throw new Error("injected baseline install failure");
          return target.renameSync(...args);
        };
      },
    });
    assert.throws(
      () => replaceVisualBaselines(
        baselineFixtureRoot,
        baselineNames.map((name) => [name, newPng]),
        { fileSystem: faultyFileSystem },
      ),
      /injected baseline install failure/,
      "baseline replacement should surface an installation failure",
    );
    baselineNames.forEach((name) => {
      assert.deepEqual(
        fs.readFileSync(path.join(baselineFixtureRoot, `${name}.png`)),
        oldPng,
        "a failed baseline transaction should restore every previous image",
      );
    });
    assert.deepEqual(
      fs.readdirSync(baselineFixtureRoot).sort(),
      baselineNames.map((name) => `${name}.png`).sort(),
      "a failed baseline transaction should remove staging and backup directories",
    );
  } finally {
    fs.rmSync(baselineFixtureRoot, { recursive: true, force: true });
  }

  const parsed = toObject(parseDotEnvSource([
    "PLAIN=value",
    "HASH=part#of-value",
    "COMMENTED=value # trailing note",
    'DOUBLE="secret value" # trailing note',
    "SINGLE='literal # value' # trailing note",
    'ESCAPED="line\\ncolumn\\t\\"quoted\\"\\\\tail"',
    "export EXPORTED=from-file",
    "INVALID KEY=ignored",
  ].join("\n")));

  assert.deepEqual(parsed, {
    PLAIN: "value",
    HASH: "part#of-value",
    COMMENTED: "value",
    DOUBLE: "secret value",
    SINGLE: "literal # value",
    ESCAPED: 'line\ncolumn\t"quoted"\\tail',
    EXPORTED: "from-file",
  }, "shared dotenv parser should handle quotes, escapes, exports, and trailing comments");

  const windowsPath = toObject(parseDotEnvSource('PATH_VALUE="C:\\\\work\\\\file"'));
  assert.equal(windowsPath.PATH_VALUE, "C:\\work\\file", "dotenv double-quoted backslashes should decode once");
  assert.throws(
    () => parseDotEnvSource('VALID=value\nBROKEN="unterminated'),
    /Invalid \.env syntax on line 2: unterminated quoted value/,
    "dotenv parser should reject unterminated quoted values with an actionable line number",
  );
  assert.throws(
    () => parseDotEnvSource("VALID=value\nBROKEN='closed' trailing-junk"),
    /Invalid \.env syntax on line 2: unexpected content after the closing quote/,
    "dotenv parser should reject non-comment content after a closing quote with an actionable line number",
  );

  const oldAssetVersion = "20260716-v85-11111111aaaa";
  const currentAssetVersion = "20260717-v86-22222222bbbb";
  const recoveredAssetVersion = "20260717-v86-33333333cccc";
  assert.equal(
    replaceAssetVersionTokens(
      `old=${oldAssetVersion}; current=${currentAssetVersion}`,
      recoveredAssetVersion,
    ),
    `old=${recoveredAssetVersion}; current=${recoveredAssetVersion}`,
    "asset stamping should converge mixed old/new keys after a partially failed prior write",
  );

  const fingerprintFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "share-everything-fingerprint-"));
  try {
    fs.mkdirSync(path.join(fingerprintFixtureRoot, "js"));
    fs.mkdirSync(path.join(fingerprintFixtureRoot, "css"));
    fs.writeFileSync(
      path.join(fingerprintFixtureRoot, "js/app.js"),
      `const ASSET_VERSION = "${currentAssetVersion}";\n`,
    );
    fs.writeFileSync(
      path.join(fingerprintFixtureRoot, "css/style.css"),
      `.fixture { background: url("/asset.svg?v=${oldAssetVersion}"); }\n`,
    );
    fs.writeFileSync(
      path.join(fingerprintFixtureRoot, "manifest.webmanifest"),
      `{"start_url":"/?v=${currentAssetVersion}"}\n`,
    );
    const mixedKeyFingerprint = computeExpectedAssetVersion(
      fingerprintFixtureRoot,
      currentAssetVersion,
    );
    fs.writeFileSync(
      path.join(fingerprintFixtureRoot, "css/style.css"),
      `.fixture { background: url("/asset.svg?v=${currentAssetVersion}"); }\n`,
    );
    const unifiedKeyFingerprint = computeExpectedAssetVersion(
      fingerprintFixtureRoot,
      currentAssetVersion,
    );
    assert.equal(
      mixedKeyFingerprint,
      unifiedKeyFingerprint,
      "asset hashing should normalize every valid runtime key so partial writes do not perturb the next fingerprint",
    );
  } finally {
    fs.rmSync(fingerprintFixtureRoot, { recursive: true, force: true });
  }

  const mobileFallbackSource = [
    "html.is-mobile-device-viewport .hand-written { color: red; }",
    "@media (max-width: 768px) and (hover: none) and (pointer: coarse) {",
    "  .generated-source { color: blue; }",
    "}",
  ].join("\n");
  const firstMobileFallbackBuild = buildMobileFallbacks(mobileFallbackSource, "fixture.css");
  const secondMobileFallbackBuild = buildMobileFallbacks(firstMobileFallbackBuild, "fixture.css");
  assert.equal(secondMobileFallbackBuild, firstMobileFallbackBuild, "mobile fallback generation should be idempotent");
  assert.ok(
    firstMobileFallbackBuild.includes("html.is-mobile-device-viewport .hand-written"),
    "mobile fallback generation should preserve hand-written compatibility selectors outside its markers",
  );
  assert.equal(
    (firstMobileFallbackBuild.match(/MOBILE_FALLBACKS_START/g) || []).length,
    1,
    "mobile fallback generation should own one explicit marker range",
  );

  for (const [file, expectedSize] of [
    ["assets/icon-192.png", 192],
    ["assets/icon-512.png", 512],
    ["assets/icon-maskable-512.png", 512],
  ]) {
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.format, "png", `${file} should be a real PNG`);
    assert.equal(metadata.width, expectedSize, `${file} should match its declared width`);
    assert.equal(metadata.height, expectedSize, `${file} should match its declared height`);
  }
}
