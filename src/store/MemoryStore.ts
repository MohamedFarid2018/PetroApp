/**
 * Thread-safety note (Node.js concurrency model):
 *
 * Node.js runs JavaScript on a single thread with a cooperative event loop.
 * A synchronous block of code — like the check-then-insert loop below — cannot
 * be interleaved with another request handler unless it explicitly yields
 * (await, I/O callback, etc.).  Because insertEvents and getStationSummary
 * contain no async operations, they are effectively atomic with respect to
 * other incoming requests.
 *
 * Two concurrent POST requests that carry the same event_id will be queued on
 * the event loop and executed one after the other. Whichever runs second will
 * find the ID already in the Map and count it as a duplicate — no double-insert
 * is possible without explicit yielding.
 *
 * Worker threads / clustering would require an external store (Redis, DB) with
 * a unique constraint, but that is outside the stated scope of this exercise.
 */

import { InsertResult, StationSummary, TransferEvent } from '../domain/transfer';
import { IStore } from './IStore';

export class MemoryStore implements IStore {
  private readonly events = new Map<string, TransferEvent>();

  insertEvents(events: TransferEvent[]): InsertResult {
    let inserted = 0;
    let duplicates = 0;

    for (const event of events) {
      if (this.events.has(event.event_id)) {
        duplicates++;
      } else {
        this.events.set(event.event_id, event);
        inserted++;
      }
    }

    return { inserted, duplicates };
  }

  getStationSummary(stationId: string): StationSummary {
    let total_approved_amount = 0;
    let events_count = 0;

    for (const event of this.events.values()) {
      if (event.station_id !== stationId) continue;

      events_count++;
      if (event.status === 'approved') {
        total_approved_amount += event.amount;
      }
    }

    // Round to avoid floating-point drift in amounts.
    total_approved_amount = Math.round(total_approved_amount * 100) / 100;

    return { station_id: stationId, total_approved_amount, events_count };
  }
}
