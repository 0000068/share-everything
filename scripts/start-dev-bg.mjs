import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const outLog = path.join(rootDir, ".local-server.out.log");
const errLog = path.join(rootDir, ".local-server.err.log");
const pidFile = path.join(rootDir, ".local-server.pid");
const serverScript = path.join(rootDir, "scripts", "local-server.mjs");

const port = Number.parseInt(process.env.PORT || "4173", 10) || 4173;
const host = process.env.HOST || "127.0.0.1";

function portInUse(p, h) {
  return new Promise((resolve) => {
    const tester = net.createConnection({ port: p, host: h });
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      try { tester.destroy(); } catch {}
      resolve(result);
    }

    tester.setTimeout(800, () => finish(false));
    tester.once("connect", () => finish(true));
    tester.once("error", () => finish(false));
  });
}

function quotePowerShellString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quotePowerShellArray(values) {
  return `@(${values.map(quotePowerShellString).join(", ")})`;
}

function startWithPowerShell() {
  const command = [
    `$env:PORT = ${quotePowerShellString(String(port))}`,
    `$env:HOST = ${quotePowerShellString(host)}`,
    `$p = Start-Process -FilePath ${quotePowerShellString(process.execPath)} -ArgumentList ${quotePowerShellArray([serverScript])} -WorkingDirectory ${quotePowerShellString(rootDir)} -RedirectStandardOutput ${quotePowerShellString(outLog)} -RedirectStandardError ${quotePowerShellString(errLog)} -WindowStyle Hidden -PassThru`,
    "$p.Id",
  ].join("; ");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      cwd: rootDir,
      encoding: "utf8",
      windowsHide: true,
    },
  );

  if (result.status !== 0) {
    const detail = result.stderr || result.stdout || `exit code ${result.status}`;
    throw new Error(`Failed to start local server with PowerShell: ${detail.trim()}`);
  }

  const pid = Number.parseInt(String(result.stdout || "").trim().split(/\s+/).at(-1), 10);
  if (!Number.isFinite(pid)) {
    throw new Error(`PowerShell did not return a server pid: ${result.stdout || result.stderr || "(empty output)"}`);
  }
  return pid;
}

function startWithDetachedNode() {
  const outFd = openSync(outLog, "a");
  const errFd = openSync(errLog, "a");
  const child = spawn(
    process.execPath,
    [serverScript],
    {
      cwd: rootDir,
      detached: true,
      stdio: ["ignore", outFd, errFd],
      windowsHide: true,
      env: { ...process.env, PORT: String(port), HOST: host },
    },
  );
  child.unref();
  try { closeSync(outFd); } catch {}
  try { closeSync(errFd); } catch {}
  return child.pid;
}

const inUse = await portInUse(port, host);
if (inUse) {
  console.log(`Local server already listening at http://${host}:${port} - nothing to do.`);
  process.exit(0);
}

if (existsSync(pidFile)) {
  try { unlinkSync(pidFile); } catch {}
}

let pid;
try {
  pid = process.platform === "win32" ? startWithPowerShell() : startWithDetachedNode();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

writeFileSync(pidFile, String(pid));

console.log(`Local server starting in background (pid ${pid}) -> http://${host}:${port}`);
console.log(`  stdout: ${path.relative(rootDir, outLog)}`);
console.log(`  stderr: ${path.relative(rootDir, errLog)}`);
console.log(`  pid file: ${path.relative(rootDir, pidFile)}  (use 'npm run stop:bg' to stop)`);
