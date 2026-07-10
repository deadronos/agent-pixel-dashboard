import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLiveEntitySocket } from "./live-entity-socket.js";

type MockSocketEvent = { data?: string };

type MockSocketListener = (event: MockSocketEvent) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  private listeners = new Map<string, Set<MockSocketListener>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: MockSocketListener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: MockSocketListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: MockSocketEvent = {}): void {
    const handlers = this.listeners.get(type);
    if (!handlers) {
      return;
    }
    for (const listener of handlers) {
      listener(event);
    }
  }

  open(): void {
    this.dispatch("open");
  }

  close(): void {
    this.dispatch("close");
  }

  error(): void {
    this.dispatch("error");
  }

  message(data: string): void {
    this.dispatch("message", { data });
  }

  // Properties/methods required by the WebSocket type but unused in tests.
  readyState = 0;
  bufferedAmount = 0;
  onopen: unknown = null;
  onclose: unknown = null;
  onerror: unknown = null;
  onmessage: unknown = null;
  extensions = "";
  protocol = "";
}

function buildCreateSocket(): (url: string) => WebSocket {
  return (url: string) => new MockWebSocket(url) as unknown as WebSocket;
}

describe("createLiveEntitySocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconnects with backoff after the socket closes and re-enters the live state on the next open", () => {
    const states: string[] = [];
    const messages: string[] = [];
    const connector = createLiveEntitySocket({
      url: "ws://localhost:3030/ws",
      createSocket: buildCreateSocket(),
      onStateChange: (state) => states.push(state),
      onMessage: (data) => messages.push(data),
      initialBackoffMs: 100,
      maxBackoffMs: 1_000
    });

    connector.start();

    expect(MockWebSocket.instances).toHaveLength(1);
    MockWebSocket.instances[0].open();
    expect(states).toEqual(["connecting", "live"]);

    // The hub restarts / the connection blips.
    MockWebSocket.instances[0].close();
    expect(states).toEqual(["connecting", "live", "offline"]);

    // Backoff timer is pending — no new socket yet.
    expect(MockWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(99);
    expect(MockWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    // New socket succeeds → live again, messages flow through it.
    MockWebSocket.instances[1].open();
    expect(states).toEqual(["connecting", "live", "offline", "connecting", "live"]);
    MockWebSocket.instances[1].message("hello");
    expect(messages).toEqual(["hello"]);

    connector.stop();
  });

  it("does not reconnect after stop() is called", () => {
    const states: string[] = [];
    const connector = createLiveEntitySocket({
      url: "ws://localhost:3030/ws",
      createSocket: buildCreateSocket(),
      onStateChange: (state) => states.push(state),
      onMessage: () => undefined,
      initialBackoffMs: 50,
      maxBackoffMs: 1_000
    });

    connector.start();
    MockWebSocket.instances[0].open();
    connector.stop();

    // The cleanup timer was scheduled but stop() should clear it.
    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(states).toEqual(["connecting", "live"]);
  });

  it("grows the backoff across repeated failures and resets it after a successful open", () => {
    const states: string[] = [];
    const connector = createLiveEntitySocket({
      url: "ws://localhost:3030/ws",
      createSocket: buildCreateSocket(),
      onStateChange: (state) => states.push(state),
      onMessage: () => undefined,
      initialBackoffMs: 100,
      maxBackoffMs: 1_000
    });

    connector.start();
    MockWebSocket.instances[0].open();

    // First failure — backoff should be the initial value (100ms).
    MockWebSocket.instances[0].close();
    vi.advanceTimersByTime(100);
    expect(MockWebSocket.instances).toHaveLength(2);
    MockWebSocket.instances[1].close();

    // Second failure — backoff should double to 200ms.
    vi.advanceTimersByTime(199);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    // Third failure — backoff should double to 400ms.
    MockWebSocket.instances[2].close();
    vi.advanceTimersByTime(399);
    expect(MockWebSocket.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(4);

    // A successful open resets the backoff.
    MockWebSocket.instances[3].open();

    // Next failure should wait the initial 100ms, not the doubled value.
    MockWebSocket.instances[3].close();
    vi.advanceTimersByTime(100);
    expect(MockWebSocket.instances).toHaveLength(5);

    connector.stop();
  });

  it("tears down the prior socket when start() is called twice", () => {
    const states: string[] = [];
    const connector = createLiveEntitySocket({
      url: "ws://localhost:3030/ws",
      createSocket: buildCreateSocket(),
      onStateChange: (state) => states.push(state),
      onMessage: () => undefined,
      initialBackoffMs: 100,
      maxBackoffMs: 1_000
    });

    connector.start();
    MockWebSocket.instances[0].open();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(states).toEqual(["connecting", "live"]);

    // A second start() must close the prior socket before opening a new one,
    // and must not surface an offline transition from the prior close.
    connector.start();
    expect(MockWebSocket.instances).toHaveLength(2);

    // The new socket is the only live one — close events from it should
    // produce offline transitions, but the first socket's close event was
    // swallowed during teardown so no extra offline state was emitted.
    MockWebSocket.instances[1].open();
    expect(states).toEqual(["connecting", "live", "connecting", "live"]);

    // Closing the leaked first socket would emit a spurious offline event if
    // its listener were still attached — verify it is gone.
    MockWebSocket.instances[0].close();
    expect(states).toEqual(["connecting", "live", "connecting", "live"]);

    MockWebSocket.instances[1].close();
    expect(states).toEqual([
      "connecting",
      "live",
      "connecting",
      "live",
      "offline"
    ]);

    connector.stop();
  });

  it("schedules a reconnect when the WebSocket fires error without a matching close event", () => {
    const states: string[] = [];
    const connector = createLiveEntitySocket({
      url: "ws://localhost:3030/ws",
      createSocket: buildCreateSocket(),
      onStateChange: (state) => states.push(state),
      onMessage: () => undefined,
      initialBackoffMs: 100,
      maxBackoffMs: 1_000
    });

    connector.start();
    MockWebSocket.instances[0].error();
    // No close event — error alone must still drive the offline / reconnect path.
    vi.advanceTimersByTime(100);
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(states).toEqual(["connecting", "offline", "connecting"]);

    connector.stop();
  });
});