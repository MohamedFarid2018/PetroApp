import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { IStore } from '../store/IStore';
import { insertRequestSchema } from '../validation/transferSchema';

/**
 * POST /transfers
 *
 * Validation strategy: fail-fast.
 * If any event in the batch fails validation the entire request is rejected
 * with 400 and nothing is stored. This keeps the store consistent: callers
 * always know whether their batch was accepted or not. On a corrected retry,
 * already-stored events appear as duplicates — that is safe.
 */
export function makeTransferHandler(store: IStore) {
  return function handleInsert(req: Request, res: Response): void {
    const parseResult = insertRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      const firstIssue = (parseResult.error as ZodError).issues[0];
      const path = firstIssue.path.join('.');
      const message = path ? `${path}: ${firstIssue.message}` : firstIssue.message;
      res.status(400).json({ error: message });
      return;
    }

    const events = parseResult.data.events.map((e) => ({
      event_id: e.event_id,
      station_id: e.station_id,
      amount: e.amount,
      status: e.status,
      created_at: new Date(e.created_at),
    }));

    const result = store.insertEvents(events);
    res.status(200).json(result);
  };
}
