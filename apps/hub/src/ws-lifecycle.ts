import { type HubHelloMessage } from "@agent-watch/event-schema";
import { WebSocket, type WebSocketServer } from "ws";

interface HeartbeatWebSocket extends WebSocket {
  isAlive?: boolean;
}

export interface AttachWebSocketLifecycleOptions {
  getEntityCount: () => number;
  heartbeatIntervalMs?: number;
}

export function attachWebSocketLifecycle(
  wss: WebSocketServer,
  options: AttachWebSocketLifecycleOptions
): () => void {
  wss.on("connection", (socket: HeartbeatWebSocket) => {
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    const payload: HubHelloMessage = { type: "hello", entities: options.getEntityCount() };
    socket.send(JSON.stringify(payload));
  });

  const timer = setInterval(() => {
    for (const client of wss.clients as Set<HeartbeatWebSocket>) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }

      client.isAlive = false;
      client.ping();
    }
  }, options.heartbeatIntervalMs ?? 30_000);

  return () => {
    clearInterval(timer);
  };
}
