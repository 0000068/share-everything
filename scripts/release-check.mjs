import { spawnSync } from "node:child_process";

function getNpmInvocation(scriptName) {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, "run", scriptName],
      options: {},
    };
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", scriptName],
    options: process.platform === "win32" ? { shell: true } : {},
  };
}

function runNpmScript(scriptName, env = {}) {
  const invocation = getNpmInvocation(scriptName);
  const result = spawnSync(invocation.command, invocation.args, {
    ...invocation.options,
    env: {
      ...process.env,
      ...env,
    },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

runNpmScript("check");
runNpmScript("visual:check", { VISUAL_STRICT: "1" });
