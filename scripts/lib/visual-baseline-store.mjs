import fs from "node:fs";
import path from "node:path";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function validateBaseline(name, bytes) {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`Invalid visual baseline name: ${name}`);
  }
  if (!Buffer.isBuffer(bytes) || bytes.length < 10_000 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Invalid or blank visual baseline PNG: ${name}`);
  }
}

export function replaceVisualBaselines(baselineDir, baselineEntries, { fileSystem = fs } = {}) {
  const entries = [...baselineEntries];
  if (entries.length === 0) throw new Error("No visual baselines were provided");
  entries.forEach(([name, bytes]) => validateBaseline(name, bytes));
  if (new Set(entries.map(([name]) => name)).size !== entries.length) {
    throw new Error("Visual baseline names must be unique");
  }

  fileSystem.mkdirSync(baselineDir, { recursive: true });
  const transactionDir = fileSystem.mkdtempSync(path.join(baselineDir, ".baseline-update-"));
  const stageDir = path.join(transactionDir, "stage");
  const backupDir = path.join(transactionDir, "backup");
  fileSystem.mkdirSync(stageDir);
  fileSystem.mkdirSync(backupDir);

  const backedUp = [];
  const installed = [];
  let operationError = null;
  let rollbackError = null;

  try {
    for (const [name, bytes] of entries) {
      fileSystem.writeFileSync(path.join(stageDir, `${name}.png`), bytes);
    }

    for (const [name] of entries) {
      const target = path.join(baselineDir, `${name}.png`);
      if (!fileSystem.existsSync(target)) continue;
      fileSystem.renameSync(target, path.join(backupDir, `${name}.png`));
      backedUp.push(name);
    }

    for (const [name] of entries) {
      fileSystem.renameSync(
        path.join(stageDir, `${name}.png`),
        path.join(baselineDir, `${name}.png`),
      );
      installed.push(name);
    }
  } catch (error) {
    operationError = error;
    try {
      for (const name of installed.reverse()) {
        fileSystem.rmSync(path.join(baselineDir, `${name}.png`), { force: true });
      }
      for (const name of backedUp.reverse()) {
        fileSystem.renameSync(
          path.join(backupDir, `${name}.png`),
          path.join(baselineDir, `${name}.png`),
        );
      }
    } catch (errorDuringRollback) {
      rollbackError = errorDuringRollback;
    }
  }

  let cleanupError = null;
  if (!rollbackError) {
    try {
      fileSystem.rmSync(transactionDir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    } catch (error) {
      cleanupError = error;
    }
  }

  const failures = [operationError, rollbackError, cleanupError].filter(Boolean);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(
      failures,
      "Visual baseline update failed and rollback/cleanup was incomplete",
      { cause: operationError || rollbackError || cleanupError },
    );
  }
}
