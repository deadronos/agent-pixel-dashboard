import type { NormalizedEvent } from '@agent-watch/event-schema';

export interface DiscoveredSessionRoot {
  id: string;
  path: string;
  host: string;
  metadata?: Record<string, unknown>;
}

export interface PluginContext {
  host: string;
  configuredRoots: string[];
  env: Record<string, string | undefined>;
}

export interface ParseContext {
  root: DiscoveredSessionRoot;
}

export interface WatchContext {
  // eslint-disable-next-line no-unused-vars
  onEvent: (_event: NormalizedEvent) => void;
  // eslint-disable-next-line no-unused-vars
  onError: (_error: Error) => void;
}

export interface WatchHandle {
  close(): Promise<void>;
}

export interface CollectorPlugin {
  id: string;
  source: string;

  // eslint-disable-next-line no-unused-vars
  discover(_config: PluginContext): Promise<DiscoveredSessionRoot[]>;
  // eslint-disable-next-line no-unused-vars
  watch(_root: DiscoveredSessionRoot, _ctx: WatchContext): Promise<WatchHandle>;
}

export {
  isActiveSessionFile,
  matchesSessionFile,
  type SessionSource,
} from './session-detection.js';
