import type { NormalizedEvent } from "@agent-watch/event-schema";
export interface DiscoveredSessionRoot {
    id: string;
    path: string;
    host: string;
    metadata?: Record<string, unknown>;
}
export interface PluginContext {
    host: string;
    configuredRoots: string[];
    env: NodeJS.ProcessEnv;
}
export interface ParseContext {
    root: DiscoveredSessionRoot;
}
export interface WatchContext {
    onEvent: (event: NormalizedEvent) => void;
    onError: (error: Error) => void;
}
export interface WatchHandle {
    close(): Promise<void>;
}
export interface CollectorPlugin {
    id: string;
    source: string;
    discover(config: PluginContext): Promise<DiscoveredSessionRoot[]>;
    watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle>;
}
