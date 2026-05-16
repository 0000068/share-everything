import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { diffPng } from "../lib/pixel-diff.mjs";

const rootDir = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const baselineDir = path.join(rootDir, "scripts/visual-baselines");
const scenarioNames = ["mobile-home", "mobile-blog", "mobile-post-empty", "desktop-home"];

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
  const outputDir = path.join(os.tmpdir(), `share-everything-baseline-${Date.now()}-${index}`);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const invocation = getNpmRunInvocation();
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: rootDir,
    stdio: "inherit",
    env: {
      ...process.env,
      VISUAL_OUTPUT_DIR: outputDir,
      VISUAL_SKIP_DIFF: "1",
    },
  });
  if (result.status !== 0) {
    throw new Error(`visual:check failed while generating baseline sample ${index + 1}`);
  }
  return outputDir;
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

function chooseStableSample(samples) {
  const scores = samples.map((sample, index) => {
    const otherIndexes = samples.map((_, sampleIndex) => sampleIndex).filter((sampleIndex) => sampleIndex !== index);
    const total = otherIndexes.reduce((sum, otherIndex) => (
      sum + diffPng(sample, samples[otherIndex], { threshold: 0.05 }).diffRatio
    ), 0);
    return { index, total };
  });
  return scores.sort((a, b) => a.total - b.total)[0].index;
}

fs.mkdirSync(baselineDir, { recursive: true });
const outputDirs = [0, 1, 2].map((index) => runVisualCapture(index));
const report = {};

for (const name of scenarioNames) {
  const samples = readScenarioSamples(outputDirs, name);
  const index = chooseStableSample(samples);
  const targetPath = path.join(baselineDir, `${name}.png`);
  fs.writeFileSync(targetPath, samples[index]);
  report[name] = { selectedSample: index + 1 };
}

console.log(`Visual baselines generated in ${baselineDir}`);
console.log(JSON.stringify(report, null, 2));
