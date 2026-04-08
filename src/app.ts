import express from 'express';
import { IStore } from './store/IStore';
import { makeTransferHandler } from './handlers/transfers';
import { makeStationHandler } from './handlers/stations';

export function createApp(store: IStore) {
  const app = express();

  app.use(express.json({ limit: '10mb' }));

  // Reject POST requests that are not JSON before they reach handlers.
  app.use((req, res, next) => {
    if (req.method === 'POST' && !req.is('application/json')) {
      res.status(415).json({ error: 'Content-Type must be application/json' });
      return;
    }
    next();
  });

  // Basic request logging
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
  });

  app.post('/transfers', makeTransferHandler(store));
  app.get('/stations/:station_id/summary', makeStationHandler(store));

  // 404 fallback
  app.use((_req, res) => {
    res.status(404).json({ error: 'route not found' });
  });

  return app;
}
