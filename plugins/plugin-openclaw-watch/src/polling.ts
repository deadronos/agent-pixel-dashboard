import fs from "node:fs/promises";
import path from "node:path";

export interface CollectOptions {
  maxDepth: number;
  maxFiles: number;
}

export async function collectJsonlFiles(root: string, options: CollectOptions): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string, depth: number): Promise<void> {
    if (results.length >= options.maxFiles) {
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= options.maxFiles) {
        return;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
        continue;
      }
      if (entry.isDirectory() && depth < options.maxDepth) {
        await walk(fullPath, depth + 1);
      }
    }
  }

  await walk(root, 0);
  return results;
}
