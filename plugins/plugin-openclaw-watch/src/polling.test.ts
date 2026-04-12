import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { collectJsonlFiles } from "./polling.js";

const createdDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirs.splice(0, createdDirs.length).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    })
  );
});

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-watch-"));
  createdDirs.push(dir);
  return dir;
}

describe("collectJsonlFiles", () => {
  it("collects .jsonl files recursively up to max depth", async () => {
    const root = await makeTempDir();
    await fs.mkdir(path.join(root, "a", "b"), { recursive: true });
    await fs.writeFile(path.join(root, "top.jsonl"), "");
    await fs.writeFile(path.join(root, "a", "nested.jsonl"), "");
    await fs.writeFile(path.join(root, "a", "b", "too-deep.jsonl"), "");
    await fs.writeFile(path.join(root, "a", "not-json.txt"), "");

    const files = await collectJsonlFiles(root, { maxDepth: 1, maxFiles: 50 });
    const rel = files.map((file) => path.relative(root, file)).sort();

    expect(rel).toEqual(["a/nested.jsonl", "top.jsonl"]);
  });

  it("stops once max files are collected", async () => {
    const root = await makeTempDir();
    await fs.mkdir(path.join(root, "x"), { recursive: true });
    await fs.writeFile(path.join(root, "x", "1.jsonl"), "");
    await fs.writeFile(path.join(root, "x", "2.jsonl"), "");
    await fs.writeFile(path.join(root, "x", "3.jsonl"), "");

    const files = await collectJsonlFiles(root, { maxDepth: 5, maxFiles: 2 });
    expect(files).toHaveLength(2);
  });
});
