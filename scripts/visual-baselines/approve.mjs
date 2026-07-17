// Only use this after confirming an intentional design change requires new
// baselines. Do not run it just to make CI pass.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VISUAL_SCENARIO_NAMES } from "../lib/visual-scenarios.mjs";
import { replaceVisualBaselines } from "../lib/visual-baseline-store.mjs";

const rootDir = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const baselineDir = path.join(rootDir, "scripts/visual-baselines");
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "share-everything-visual-approve-"));

function getNpmRunInvocation() {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd", "run", "visual:check"],
    };
  }
  return { command: "npm", args: ["run", "visual:check"] };
}

let operationError = null;
try {
  const invocation = getNpmRunInvocation();
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      VISUAL_OUTPUT_DIR: outputDir,
      VISUAL_SKIP_DIFF: "1",
      VISUAL_STRICT: "1",
    },
  });
  if (result.status !== 0) {
    throw new Error(`visual:check failed while approving baselines (exit ${result.status ?? "unknown"})`);
  }

  const baselines = VISUAL_SCENARIO_NAMES.map((name) => [
    name,
    fs.readFileSync(path.join(outputDir, `${name}.png`)),
  ]);
  replaceVisualBaselines(baselineDir, baselines);
} catch (error) {
  operationError = error;
}

let cleanupError = null;
try {
  fs.rmSync(outputDir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
} catch (error) {
  cleanupError = error;
}
if (operationError && cleanupError) {
  throw new AggregateError(
    [operationError, cleanupError],
    "Visual baseline approval failed and temporary cleanup was incomplete",
    { cause: operationError },
  );
}
if (operationError) throw operationError;
if (cleanupError) throw cleanupError;

console.log(`Approved visual baselines from ${outputDir}`);
