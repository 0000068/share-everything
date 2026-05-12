import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const pidFile = path.join(rootDir, ".local-server.pid");

if (!existsSync(pidFile)) {
  console.log("No pid file — local server is not tracked as running.");
  process.exit(0);
}

const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
if (!Number.isFinite(pid)) {
  console.log("Pid file is corrupt; removing it.");
  unlinkSync(pidFile);
  process.exit(0);
}

try {
  process.kill(pid);
  console.log(`Stopped local server (pid ${pid}).`);
} catch (e) {
  if (e.code === "ESRCH") {
    console.log(`Process ${pid} was not running.`);
  } else {
    console.error(`Failed to stop pid ${pid}: ${e.message}`);
    process.exit(1);
  }
}

try { unlinkSync(pidFile); } catch {}
