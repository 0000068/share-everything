// Shared minimal `.env` loader for local scripts. Intentionally avoids the
// dotenv dependency: only handles the syntax we actually commit (KEY=value,
// optional `export ` prefix, single/double quoted values with the common
// escape sequences, `#` line/trailing comments). Existing process env wins,
// matching the long-standing dev expectation that explicit shell exports
// override the file.

import { readFile } from "node:fs/promises";

function decodeDoubleQuotedValue(value) {
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== "\\" || index === value.length - 1) {
      decoded += character;
      continue;
    }

    const escaped = value[index + 1];
    const replacements = {
      "\\": "\\",
      n: "\n",
      r: "\r",
      t: "\t",
      '"': '"',
    };
    if (Object.prototype.hasOwnProperty.call(replacements, escaped)) {
      decoded += replacements[escaped];
      index += 1;
      continue;
    }

    decoded += `\\${escaped}`;
    index += 1;
  }
  return decoded;
}

function findClosingQuote(value, quote) {
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] !== quote) continue;
    if (quote === "'" || value[index - 1] !== "\\") return index;

    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
      slashCount += 1;
    }
    if (slashCount % 2 === 0) return index;
  }
  return -1;
}

function createDotEnvSyntaxError(lineNumber, message) {
  const error = new SyntaxError(`Invalid .env syntax on line ${lineNumber}: ${message}`);
  error.lineNumber = lineNumber;
  return error;
}

function parseValue(rawValue, lineNumber) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) return "";

  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    const closingQuoteIndex = findClosingQuote(trimmed, quote);
    if (closingQuoteIndex < 0) {
      throw createDotEnvSyntaxError(lineNumber, "unterminated quoted value");
    }

    const remainder = trimmed.slice(closingQuoteIndex + 1).trim();
    if (remainder && !remainder.startsWith("#")) {
      throw createDotEnvSyntaxError(
        lineNumber,
        "unexpected content after the closing quote (only a comment is allowed)",
      );
    }

    const value = trimmed.slice(1, closingQuoteIndex);
    return quote === '"' ? decodeDoubleQuotedValue(value) : value;
  }

  return trimmed.replace(/\s+#.*$/, "").trim();
}

function parseLine(rawLine, lineNumber) {
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
    value: parseValue(normalizedLine.slice(separatorIndex + 1), lineNumber),
  };
}

export function parseDotEnvSource(source) {
  return String(source || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line, index) => parseLine(line, index + 1))
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
