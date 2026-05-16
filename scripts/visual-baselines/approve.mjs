// Only use this after confirming an intentional design change requires new
// baselines. Do not run it just to make CI pass.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const baselineDir = path.join(rootDir, "scripts/visual-baselines");
const outputDir = path.join(os.tmpdir(), `share-everything-visual-approve-${Date.now()}`);
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
  process.exit(result.status || 1);
}

fs.mkdirSync(baselineDir, { recursive: true });
for (const name of scenarioNames) {
  fs.copyFileSync(path.join(outputDir, `${name}.png`), path.join(baselineDir, `${name}.png`));
}

console.log(`Approved visual baselines from ${outputDir}`);
