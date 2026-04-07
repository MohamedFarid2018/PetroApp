import { InsertResult, StationSummary, TransferEvent } from '../domain/transfer';

/**
 * Persistence port. Swap implementations (in-memory ↔ database) without
 * touching any handler or service code.
 */
export interface IStore {
  /**
   * Insert events idempotently by event_id.
   * Events whose event_id already exists are counted as duplicates and skipped.
   */
  insertEvents(events: TransferEvent[]): InsertResult;

  /**
   * Return reconciliation totals for one station.
   * Returns a zero-total summary (not an error) when the station has no events.
   */
  getStationSummary(stationId: string): StationSummary;
}
