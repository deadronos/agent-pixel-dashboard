import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2].trim();
    const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
    const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
    if (isDoubleQuoted || isSingleQuoted) {
      value = value.slice(1, -1);
      if (isDoubleQuoted) {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getRepoRoot(fromImportMetaUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(fromImportMetaUrl)), "../../../");
}

export function loadRepoEnv(fromImportMetaUrl: string): void {
  const repoRoot = getRepoRoot(fromImportMetaUrl);
  parseEnvFile(path.join(repoRoot, ".env"));
  parseEnvFile(path.join(repoRoot, ".env.local"));
}
