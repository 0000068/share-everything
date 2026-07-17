import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { diffPng } from "../lib/pixel-diff.mjs";
import { VISUAL_SCENARIO_NAMES } from "../lib/visual-scenarios.mjs";
import { replaceVisualBaselines } from "../lib/visual-baseline-store.mjs";

const rootDir = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const baselineDir = path.join(rootDir, "scripts/visual-baselines");
const VISUAL_BASELINE_MAX_SAMPLE_DIFF_RATIO = 0.0025;

function getNpmRunInvocation() {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npm.cmd", "run", "visual:check"],
    };
  }
  return { command: "npm", args: ["run", "visual:check"] };
}

function runVisualCapture(index) {
  const outputDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `share-everything-baseline-${index + 1}-`),
  );
  const invocation = getNpmRunInvocation();
  try {
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
      throw new Error(`visual:check failed while generating baseline sample ${index + 1}`);
    }
    return outputDir;
  } catch (operationError) {
    try {
      removeCaptureDirectory(outputDir);
    } catch (cleanupError) {
      throw new AggregateError(
        [operationError, cleanupError],
        `Baseline sample ${index + 1} failed and its temporary directory could not be removed`,
        { cause: cleanupError },
      );
    }
    throw operationError;
  }
}

function removeCaptureDirectory(outputDir) {
  fs.rmSync(outputDir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}

function readScenarioSamples(outputDirs, name) {
  return outputDirs.map((dir) => {
    const file = path.join(dir, `${name}.png`);
    if (!fs.existsSync(file)) {
      throw new Error(`Missing generated screenshot: ${file}`);
    }
    return fs.readFileSync(file);
  });
}

function chooseStableSample(name, samples) {
  const pairwiseDiffs = [];
  const totals = Array.from({ length: samples.length }, () => 0);
  for (let left = 0; left < samples.length; left += 1) {
    for (let right = left + 1; right < samples.length; right += 1) {
      const { diffRatio } = diffPng(samples[left], samples[right], { threshold: 0.05 });
      pairwiseDiffs.push({ left, right, diffRatio });
      totals[left] += diffRatio;
      totals[right] += diffRatio;
    }
  }

  const maxDiffRatio = Math.max(0, ...pairwiseDiffs.map(({ diffRatio }) => diffRatio));
  if (maxDiffRatio > VISUAL_BASELINE_MAX_SAMPLE_DIFF_RATIO) {
    throw new Error(
      `${name} baseline samples did not converge: maximum pairwise diff ${maxDiffRatio.toFixed(6)} exceeded ${VISUAL_BASELINE_MAX_SAMPLE_DIFF_RATIO}`,
    );
  }

  const index = totals
    .map((total, sampleIndex) => ({ index: sampleIndex, total }))
    .sort((a, b) => a.total - b.total || a.index - b.index)[0].index;
  return { index, maxDiffRatio };
}

fs.mkdirSync(baselineDir, { recursive: true });
const outputDirs = [];
const report = {};

let operationError = null;
try {
  for (let index = 0; index < 3; index += 1) {
    outputDirs.push(runVisualCapture(index));
  }

  const selectedBaselines = [];
  for (const name of VISUAL_SCENARIO_NAMES) {
    const samples = readScenarioSamples(outputDirs, name);
    const { index, maxDiffRatio } = chooseStableSample(name, samples);
    selectedBaselines.push([name, samples[index]]);
    report[name] = {
      selectedSample: index + 1,
      maxPairwiseDiffRatio: Number(maxDiffRatio.toFixed(6)),
    };
  }
  replaceVisualBaselines(baselineDir, selectedBaselines);
} catch (error) {
  operationError = error;
}

const cleanupErrors = [];
outputDirs.forEach((outputDir) => {
  try {
    removeCaptureDirectory(outputDir);
  } catch (error) {
    cleanupErrors.push(error);
  }
});
if (operationError && cleanupErrors.length > 0) {
  throw new AggregateError(
    [operationError, ...cleanupErrors],
    "Visual baseline generation failed and temporary cleanup was incomplete",
    { cause: operationError },
  );
}
if (operationError) throw operationError;
if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, "Visual baseline temporary cleanup failed");

console.log(`Visual baselines generated in ${baselineDir}`);
console.log(JSON.stringify(report, null, 2));
