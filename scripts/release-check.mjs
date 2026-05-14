import { spawn } from "node:child_process";

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

const runningChildren = new Set();
let didRequestChildStop = false;
let firstFailureResult = null;

function isFailedResult(result) {
  return Boolean(result?.error || result?.signal || result?.status !== 0);
}

function stopRunningChildren(signal) {
  for (const child of runningChildren) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

function stopSiblingsAfterFailure(result) {
  if (!isFailedResult(result) || didRequestChildStop) {
    return;
  }

  didRequestChildStop = true;
  firstFailureResult = result;
  stopRunningChildren("SIGTERM");
}

function runNpmScript(scriptName, env = {}, onResult = () => {}) {
  const invocation = getNpmInvocation(scriptName);
  const child = spawn(invocation.command, invocation.args, {
    ...invocation.options,
    env: {
      ...process.env,
      ...env,
    },
    stdio: "inherit",
  });
  runningChildren.add(child);

  return new Promise((resolve) => {
    let settled = false;

    function finish(result) {
      if (settled) {
        return;
      }

      settled = true;
      runningChildren.delete(child);
      onResult(result);
      resolve(result);
    }

    child.once("error", (error) => {
      finish({ scriptName, error, status: 1, signal: null });
    });
    child.once("exit", (status, signal) => {
      finish({ scriptName, error: null, status, signal });
    });
  });
}

process.once("SIGINT", () => {
  stopRunningChildren("SIGINT");
  process.exit(130);
});
process.once("SIGTERM", () => {
  stopRunningChildren("SIGTERM");
  process.exit(143);
});

console.log("Running release checks in parallel: check, visual:check (VISUAL_STRICT=1)");
const results = await Promise.all([
  runNpmScript("check", {}, stopSiblingsAfterFailure),
  runNpmScript("visual:check", { VISUAL_STRICT: "1" }, stopSiblingsAfterFailure),
]);

const failedResult = firstFailureResult || results.find(isFailedResult);
if (failedResult) {
  if (failedResult.error) {
    console.error(`${failedResult.scriptName} failed to start:`, failedResult.error);
  } else if (failedResult.signal) {
    console.error(`${failedResult.scriptName} exited from signal ${failedResult.signal}`);
  }
  process.exit(failedResult.status || 1);
}
