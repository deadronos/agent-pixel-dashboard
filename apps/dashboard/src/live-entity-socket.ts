import type { ConnectionState } from "./use-live-entities.js";

// eslint-disable-next-line no-unused-vars
export type LiveEntitySocketStateListener = (state: ConnectionState) => void;
// eslint-disable-next-line no-unused-vars
export type LiveEntitySocketMessageListener = (data: string) => void;
// eslint-disable-next-line no-unused-vars
export type LiveEntitySocketFactory = (url: string) => WebSocket;

export interface LiveEntitySocketOptions {
  url: string;
  onStateChange: LiveEntitySocketStateListener;
  onMessage: LiveEntitySocketMessageListener;
  /**
   * Allows tests to inject a stub WebSocket constructor; production code
   * uses the global `WebSocket`.
   */
  createSocket?: LiveEntitySocketFactory;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface LiveEntitySocket {
  start(): void;
  stop(): void;
}

const DEFAULT_INITIAL_BACKOFF_MS = 500;
const DEFAULT_MAX_BACKOFF_MS = 30_000;

export function createLiveEntitySocket(options: LiveEntitySocketOptions): LiveEntitySocket {
  const initialBackoffMs = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url));

  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoffMs = initialBackoffMs;
  let stopped = true;

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect(): void {
    if (stopped) {
      return;
    }
    const delay = backoffMs;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      connect();
    }, delay);
  }

  function connect(): void {
    if (stopped) {
      return;
    }
    options.onStateChange("connecting");

    try {
      socket = createSocket(options.url);
    } catch {
      socket = null;
      options.onStateChange("offline");
      scheduleReconnect();
      return;
    }

    socket.addEventListener("open", () => {
      backoffMs = initialBackoffMs;
      options.onStateChange("live");
    });
    socket.addEventListener("close", () => {
      if (stopped) {
        return;
      }
      options.onStateChange("offline");
      scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      // Treat errors as transient; the subsequent close event will trigger
      // the reconnect schedule.
    });
    socket.addEventListener("message", (event) => {
      const data = (event as MessageEvent).data;
      if (typeof data !== "string") {
        return;
      }
      options.onMessage(data);
    });
  }

  return {
    start(): void {
      stopped = false;
      backoffMs = initialBackoffMs;
      connect();
    },
    stop(): void {
      stopped = true;
      clearReconnectTimer();
      if (socket) {
        try {
          socket.close();
        } catch {
          // Closing a half-open socket can throw; swallow it during teardown.
        }
        socket = null;
      }
    }
  };
}