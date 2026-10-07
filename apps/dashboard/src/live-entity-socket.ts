import type { ConnectionState } from "./use-live-entities.js";

// The callback parameter names on this interface are part of the public
// documentation (callers rely on them for clarity) even though the interface
// has no body to consume them. ESLint's base `no-unused-vars` rule fires
// regardless of `argsIgnorePattern`, since that option only applies to
// concrete function implementations.
export interface LiveEntitySocketOptions {
  url: string;
  // eslint-disable-next-line no-unused-vars
  onStateChange: (state: ConnectionState) => void;
  // eslint-disable-next-line no-unused-vars
  onMessage: (data: string) => void;
  /**
   * Allows tests to inject a stub WebSocket constructor; production code
   * uses the global `WebSocket`.
   */
  // eslint-disable-next-line no-unused-vars
  createSocket?: (url: string) => WebSocket;
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
  let offlineEmitted = false;
  // `stopped` is the user-facing on/off switch; `generation` invalidates
  // listeners attached to a previous socket so a late close/error from a
  // torn-down socket cannot leak into the new run.
  let stopped = true;
  let generation = 0;

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
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      connect();
    }, backoffMs);
  }

  function teardown(): void {
    clearReconnectTimer();
    // Bump the generation so any in-flight listeners from the prior socket
    // become no-ops even if `close()` fires synchronously after the next
    // `connect()` call has already started.
    generation++;
    if (socket) {
      socket.close();
      socket = null;
    }
  }

  function connect(): void {
    if (stopped) {
      return;
    }
    generation++;
    const myGeneration = generation;
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
      if (myGeneration !== generation) {
        return;
      }
      backoffMs = initialBackoffMs;
      offlineEmitted = false;
      options.onStateChange("live");
    });
    socket.addEventListener("close", () => {
      if (myGeneration !== generation || stopped) {
        return;
      }
      if (!offlineEmitted) {
        options.onStateChange("offline");
        offlineEmitted = true;
      }
      scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      if (myGeneration !== generation || stopped) {
        return;
      }
      // Per the WHATWG spec, `close` always follows `error`. Some older
      // browsers and embedded WebViews have shipped edge cases where
      // `error` fires without a matching `close`, which would otherwise
      // leave the dashboard stuck on "connecting". Emit offline and queue
      // a reconnect defensively; if `close` also fires it will replace the
      // pending timer and `offlineEmitted` dedups the state transition.
      if (!offlineEmitted) {
        options.onStateChange("offline");
        offlineEmitted = true;
      }
      scheduleReconnect();
    });
    socket.addEventListener("message", (event) => {
      if (myGeneration !== generation) {
        return;
      }
      const data = (event as MessageEvent).data;
      if (typeof data !== "string") {
        return;
      }
      options.onMessage(data);
    });
  }

  return {
    start(): void {
      // Re-starting must drop any prior socket/reconnect state so callers can
      // safely invoke start() again (e.g. to retry after an explicit stop).
      teardown();
      stopped = false;
      backoffMs = initialBackoffMs;
      connect();
    },
    stop(): void {
      stopped = true;
      teardown();
    }
  };
}