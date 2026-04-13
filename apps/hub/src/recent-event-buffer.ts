import type { NormalizedEvent } from "@agent-watch/event-schema";

export class RecentEventBuffer {
  private readonly ids = new Set<string>();
  private readonly buffer: Array<NormalizedEvent | undefined>;
  private index = 0;
  private count = 0;

  constructor(private readonly maxSize: number) {
    this.buffer = new Array(maxSize);
  }

  get size(): number {
    return this.count;
  }

  add(event: NormalizedEvent): boolean {
    if (this.ids.has(event.eventId)) {
      return false;
    }

    if (this.count === this.maxSize) {
      const removed = this.buffer[this.index];
      if (removed) {
        this.ids.delete(removed.eventId);
      }
    } else {
      this.count++;
    }

    this.buffer[this.index] = event;
    this.ids.add(event.eventId);
    this.index = (this.index + 1) % this.maxSize;
    return true;
  }

  snapshot(): NormalizedEvent[] {
    const events: NormalizedEvent[] = [];
    const start = this.count === this.maxSize ? this.index : 0;

    for (let offset = 0; offset < this.count; offset++) {
      const event = this.buffer[(start + offset) % this.maxSize];
      if (event) {
        events.push(event);
      }
    }

    return events;
  }
}
