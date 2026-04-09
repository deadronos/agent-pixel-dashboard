import type { CollectorPlugin, DiscoveredSessionRoot, PluginContext, WatchContext, WatchHandle } from "@agent-watch/plugin-sdk";
export declare class CodexWatchPlugin implements CollectorPlugin {
    id: string;
    source: string;
    discover(config: PluginContext): Promise<DiscoveredSessionRoot[]>;
    watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle>;
}
export default function createPlugin(): CollectorPlugin;
