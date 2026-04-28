import type { IngestBatchBody, NormalizedEvent } from "@agent-watch/event-schema";

export interface BuildBatchOptions {
  collectorId: string;
  maxBytes: number;
}

function serialize(body: IngestBatchBody): string {
  return JSON.stringify(body);
}

function byteSize(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function shrinkEvent(event: NormalizedEvent): NormalizedEvent {
  return {
    ...event,
    detail: event.detail ? `${event.detail.slice(0, 2000)}…` : event.detail,
    meta: undefined
  };
}

function encodeSingleEvent(event: NormalizedEvent, collectorId: string, maxBytes: number): string {
  let body = serialize({ collectorId, events: [event] });
  if (byteSize(body) <= maxBytes) {
    return body;
  }
  const shrunk = shrinkEvent(event);
  body = serialize({ collectorId, events: [shrunk] });
  if (byteSize(body) <= maxBytes) {
    return body;
  }
  body = serialize({
    collectorId,
    events: [
      {
        ...event,
        summary: event.summary ? event.summary.slice(0, 180) : "oversized event trimmed",
        detail: undefined,
        meta: undefined
      }
    ]
  });
  return body;
}

export function buildSizedBatches(events: NormalizedEvent[], options: BuildBatchOptions): string[] {
  if (events.length === 0) {
    return [];
  }

  const bodies: string[] = [];
  let current: NormalizedEvent[] = [];
  let currentBytes = 0;

  const baseBody = serialize({ collectorId: options.collectorId, events: [] });
  const baseBytes = byteSize(baseBody);

  const flushCurrent = (): void => {
    if (current.length === 0) {
      return;
    }
    bodies.push(serialize({ collectorId: options.collectorId, events: current }));
    current = [];
    currentBytes = 0;
  };

  for (const event of events) {
    const eventBody = JSON.stringify(event);
    const eventBytes = byteSize(eventBody);
    const additionalBytes = current.length === 0 ? eventBytes : eventBytes + 1; // +1 for comma

    if (baseBytes + currentBytes + additionalBytes <= options.maxBytes) {
      current.push(event);
      currentBytes += additionalBytes;
      continue;
    }

    flushCurrent();

    if (baseBytes + eventBytes <= options.maxBytes) {
      current.push(event);
      currentBytes = eventBytes;
      continue;
    }

    const shrunkBody = encodeSingleEvent(event, options.collectorId, options.maxBytes);
    bodies.push(shrunkBody);
  }

  flushCurrent();
  return bodies;
}
