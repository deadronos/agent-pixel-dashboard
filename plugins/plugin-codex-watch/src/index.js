import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { watch } from "chokidar";
import { makeDeterministicEventId, parseNormalizedEvent } from "@agent-watch/event-schema";
const DEFAULT_PATHS = ["~/.codex/sessions", "~/.codex/transcripts"];
function expandHome(input) {
    if (!input.startsWith("~")) {
        return input;
    }
    return path.join(os.homedir(), input.slice(1));
}
function getString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}
function parseRecord(sourceHost, filePath, record, sequence) {
    const sessionId = getString(record.session_id) ||
        getString(record.sessionId) ||
        path.basename(path.dirname(filePath));
    const entityId = `codex:session:${sessionId}`;
    const timestamp = getString(record.timestamp) ||
        getString(record.created_at) ||
        new Date().toISOString();
    const eventType = getString(record.event_type) ||
        getString(record.type) ||
        "message";
    const summary = getString(record.summary) ||
        getString(record.message) ||
        getString(record.text);
    const detail = getString(record.detail) ||
        getString(record.content);
    const rawActivity = typeof record.activityScore === "number" ? record.activityScore : undefined;
    const activityScore = rawActivity ?? (eventType.startsWith("tool") ? 0.85 : 0.6);
    const event = {
        eventId: makeDeterministicEventId({
            source: "codex",
            entityId,
            timestamp,
            eventType,
            sequence,
            detail: detail || summary
        }),
        timestamp,
        source: "codex",
        sourceHost,
        entityId,
        sessionId,
        parentEntityId: null,
        entityKind: "session",
        displayName: "Codex",
        eventType,
        status: getString(record.status, "active"),
        summary: summary || "Codex activity",
        detail: detail || undefined,
        activityScore: Math.max(0, Math.min(1, activityScore)),
        sequence,
        meta: {
            filePath,
            toolName: getString(record.toolName) || getString(record.tool_name),
            rawType: getString(record.type)
        }
    };
    return parseNormalizedEvent(event);
}
export class CodexWatchPlugin {
    id = "plugin-codex-watch";
    source = "codex";
    async discover(config) {
        const envRoots = (config.env.CODEX_SESSION_ROOTS ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
        const configured = config.configuredRoots.length > 0 ? config.configuredRoots : [...envRoots, ...DEFAULT_PATHS];
        const roots = configured.map(expandHome);
        const discovered = [];
        await Promise.all(roots.map(async (rootPath, index) => {
            try {
                const stat = await fs.stat(rootPath);
                if (!stat.isDirectory()) {
                    return;
                }
                discovered.push({
                    id: `codex-root-${index}`,
                    path: rootPath,
                    host: config.host
                });
            }
            catch {
                // Ignore missing roots.
            }
        }));
        return discovered;
    }
    async watch(root, ctx) {
        const offsets = new Map();
        const sequences = new Map();
        const ingestFile = async (filePath) => {
            if (!filePath.endsWith(".jsonl")) {
                return;
            }
            try {
                const stat = await fs.stat(filePath);
                const previousOffset = offsets.get(filePath) ?? 0;
                const nextOffset = stat.size < previousOffset ? 0 : previousOffset;
                const handle = await fs.open(filePath, "r");
                try {
                    const length = stat.size - nextOffset;
                    if (length <= 0) {
                        offsets.set(filePath, stat.size);
                        return;
                    }
                    const buffer = Buffer.alloc(length);
                    await handle.read(buffer, 0, length, nextOffset);
                    const text = buffer.toString("utf8");
                    const lines = text.split("\n").filter((line) => line.trim().length > 0);
                    for (const line of lines) {
                        let parsed;
                        try {
                            parsed = JSON.parse(line);
                        }
                        catch {
                            continue;
                        }
                        const sequence = (sequences.get(filePath) ?? 0) + 1;
                        sequences.set(filePath, sequence);
                        try {
                            const event = parseRecord(root.host, filePath, parsed, sequence);
                            ctx.onEvent(event);
                        }
                        catch (error) {
                            ctx.onError(error);
                        }
                    }
                    offsets.set(filePath, stat.size);
                }
                finally {
                    await handle.close();
                }
            }
            catch (error) {
                ctx.onError(error);
            }
        };
        const watcher = watch(root.path, {
            persistent: true,
            ignoreInitial: false,
            depth: 6,
            awaitWriteFinish: {
                stabilityThreshold: 120,
                pollInterval: 40
            }
        });
        watcher.on("add", (filePath) => {
            void ingestFile(filePath);
        });
        watcher.on("change", (filePath) => {
            void ingestFile(filePath);
        });
        watcher.on("error", (error) => {
            ctx.onError(error);
        });
        return {
            close: async () => {
                await watcher.close();
            }
        };
    }
}
export default function createPlugin() {
    return new CodexWatchPlugin();
}
//# sourceMappingURL=index.js.map