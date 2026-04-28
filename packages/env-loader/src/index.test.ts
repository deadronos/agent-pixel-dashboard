import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { loadRepoEnv } from "./index.js";

const createdDirs: string[] = [];
const touchedKeys = ["ENV_LOADER_MULTILINE", "ENV_LOADER_QUOTED_HASH", "ENV_LOADER_SINGLE"] as const;

afterEach(async () => {
  for (const key of touchedKeys) {
    Reflect.deleteProperty(process.env, key);
  }
  await Promise.all(
    createdDirs.splice(0, createdDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function makeRepoEnv(contents: string): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "env-loader-repo-"));
  createdDirs.push(repoRoot);
  await fs.mkdir(path.join(repoRoot, "apps", "hub", "src"), { recursive: true });
  await fs.writeFile(path.join(repoRoot, ".env"), contents);
  return path.join(repoRoot, "apps", "hub", "src", "env.ts");
}

describe("loadRepoEnv", () => {
  it("decodes common escape sequences in double-quoted values", async () => {
    const importPath = await makeRepoEnv([
      'ENV_LOADER_MULTILINE="line one\\nline two"',
      'ENV_LOADER_QUOTED_HASH="value # still value"',
      "ENV_LOADER_SINGLE='line one\\nline two'",
    ].join("\n"));

    loadRepoEnv(pathToFileURL(importPath).href);

    expect(process.env.ENV_LOADER_MULTILINE).toBe("line one\nline two");
    expect(process.env.ENV_LOADER_QUOTED_HASH).toBe("value # still value");
    expect(process.env.ENV_LOADER_SINGLE).toBe("line one\\nline two");
  });
});
