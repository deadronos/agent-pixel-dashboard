import os from 'node:os';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { loadConfig } from './config.js';

vi.mock('node:os', () => ({
  default: {
    hostname: vi.fn(() => 'test-host'),
  },
}));

describe('loadConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return default config when empty environment is passed', () => {
    const config = loadConfig({ HUB_AUTH_TOKEN: 'test-token' });

    expect(config).toEqual({
      collectorId: 'collector-test-host',
      hostName: 'test-host',
      hubUrl: 'http://localhost:3030',
      hubToken: 'test-token',
      flushIntervalMs: 500,
      maxBatchBytes: 1500000,
      watchSources: ['auto'],
      pluginsDir: '',
      sessionRoots: [],
    });
  });

  it('should parse and override defaults with valid environment variables', () => {
    const env = {
      COLLECTOR_ID: 'custom-collector',
      COLLECTOR_HOST: 'custom-host',
      HUB_URL: 'https://api.example.com',
      HUB_AUTH_TOKEN: 'super-secret',
      FLUSH_INTERVAL_MS: '1000',
      MAX_BATCH_BYTES: '2000000',
      WATCH_SOURCES: 'docker, kubernetes',
      PLUGINS_DIR: '/opt/plugins',
      CODEX_SESSION_ROOTS: '/var/log/codex1, /var/log/codex2',
    };

    const config = loadConfig(env);

    expect(config).toEqual({
      collectorId: 'custom-collector',
      hostName: 'custom-host',
      hubUrl: 'https://api.example.com',
      hubToken: 'super-secret',
      flushIntervalMs: 1000,
      maxBatchBytes: 2000000,
      watchSources: ['docker', 'kubernetes'],
      pluginsDir: '/opt/plugins',
      sessionRoots: ['/var/log/codex1', '/var/log/codex2'],
    });
  });

  it('should trim and filter comma-separated environment variables', () => {
    const env = {
      WATCH_SOURCES: '  auto  , , DoCker  ,  ',
      CODEX_SESSION_ROOTS: '  /root1  ,, /root2 , ',
      HUB_AUTH_TOKEN: 'test-token',
    };

    const config = loadConfig(env);

    expect(config.watchSources).toEqual(['auto', 'docker']);
    expect(config.sessionRoots).toEqual(['/root1', '/root2']);
  });

  it('should handle invalid number formats as NaN', () => {
    const env = {
      FLUSH_INTERVAL_MS: 'invalid',
      MAX_BATCH_BYTES: 'invalid',
      HUB_AUTH_TOKEN: 'test-token',
    };

    const config = loadConfig(env);

    expect(Number.isNaN(config.flushIntervalMs)).toBe(true);
    expect(Number.isNaN(config.maxBatchBytes)).toBe(true);
  });

  it('should handle empty string environment variables', () => {
    const env = {
      WATCH_SOURCES: '',
      CODEX_SESSION_ROOTS: '',
      HUB_AUTH_TOKEN: 'test-token',
    };

    const config = loadConfig(env);

    expect(config.watchSources).toEqual([]);
    expect(config.sessionRoots).toEqual([]);
  });
});
