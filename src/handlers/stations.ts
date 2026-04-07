import { Request, Response } from 'express';
import { IStore } from '../store/IStore';

/**
 * GET /stations/:station_id/summary
 *
 * events_count: count of ALL stored events for the station (any status).
 * total_approved_amount: sum of amounts for status === 'approved' only.
 *
 * Returns a zero-total summary for unknown stations (not 404) — a station
 * may legitimately have no activity yet.
 */
export function makeStationHandler(store: IStore) {
  return function handleSummary(req: Request, res: Response): void {
    const { station_id } = req.params;
    const summary = store.getStationSummary(station_id);
    res.status(200).json(summary);
  };
}
