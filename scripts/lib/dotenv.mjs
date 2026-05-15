// Shared minimal `.env` loader for local scripts. Intentionally avoids the
// dotenv dependency: only handles the syntax we actually commit (KEY=value,
// optional `export ` prefix, single/double quoted values with the common
// escape sequences, `#` line/trailing comments). Existing process env wins,
// matching the long-standing dev expectation that explicit shell exports
// override the file.

import { readFile } from "node:fs/promises";

function parseValue(rawValue) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) return "";

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed.replace(/\s+#.*$/, "").trim();
}

function parseLine(rawLine) {
  const line = String(rawLine || "").trim();
  if (!line || line.startsWith("#")) return null;

  const normalizedLine = line.startsWith("export ")
    ? line.slice("export ".length).trim()
    : line;
  const separatorIndex = normalizedLine.indexOf("=");
  if (separatorIndex <= 0) return null;

  const key = normalizedLine.slice(0, separatorIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  return {
    key,
    value: parseValue(normalizedLine.slice(separatorIndex + 1)),
  };
}

export function parseDotEnvSource(source) {
  return String(source || "")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map(parseLine)
    .filter(Boolean);
}

export async function loadDotEnvFile(envPath, { env = process.env } = {}) {
  let source;
  try {
    source = await readFile(envPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return false;
    throw error;
  }

  parseDotEnvSource(source).forEach(({ key, value }) => {
    if (Object.prototype.hasOwnProperty.call(env, key)) return;
    env[key] = value;
  });

  return true;
}
