import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const rootDir = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const outLog = path.join(rootDir, ".local-server.out.log");
const errLog = path.join(rootDir, ".local-server.err.log");
const pidFile = path.join(rootDir, ".local-server.pid");

const port = Number.parseInt(process.env.PORT || "4173", 10) || 4173;
const host = process.env.HOST || "127.0.0.1";

function portInUse(p, h) {
  return new Promise((resolve) => {
    const tester = net.createConnection({ port: p, host: h });
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      tester.destroy();
      resolve(result);
    }

    tester.setTimeout(800, () => finish(false));
    tester.once("connect", () => finish(true));
    tester.once("error", () => finish(false));
  });
}

const inUse = await portInUse(port, host);
if (inUse) {
  console.log(`Local server already listening at http://${host}:${port} — nothing to do.`);
  process.exit(0);
}

if (existsSync(pidFile)) {
  try { unlinkSync(pidFile); } catch {}
}

const out = openSync(outLog, "a");
const err = openSync(errLog, "a");

function closeLogHandles() {
  try { closeSync(out); } catch {}
  try { closeSync(err); } catch {}
}

const child = spawn(
  process.execPath,
  [path.join(rootDir, "scripts", "local-server.mjs")],
  {
    cwd: rootDir,
    detached: true,
    stdio: ["ignore", out, err],
    windowsHide: true,
    env: { ...process.env, PORT: String(port), HOST: host },
  }
);

child.on("error", (e) => {
  closeLogHandles();
  console.error("Failed to spawn local server:", e.message);
  process.exit(1);
});

writeFileSync(pidFile, String(child.pid));
child.unref();
closeLogHandles();

console.log(`Local server starting in background (pid ${child.pid}) -> http://${host}:${port}`);
console.log(`  stdout: ${path.relative(rootDir, outLog)}`);
console.log(`  stderr: ${path.relative(rootDir, errLog)}`);
console.log(`  pid file: ${path.relative(rootDir, pidFile)}  (use 'npm run stop:bg' to stop)`);
