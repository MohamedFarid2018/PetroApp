import http from 'http';
import request from 'supertest';
import { createApp } from '../src/app';
import { MemoryStore } from '../src/store/MemoryStore';

/**
 * Each test gets its own HTTP server backed by a fresh MemoryStore so state
 * never leaks between tests. We start the server once per test (beforeEach)
 * and shut it down after (afterEach). Passing the already-listening server to
 * supertest ensures all calls within a test share the same store instance.
 */

let store: MemoryStore;
let server: http.Server;

beforeEach((done) => {
  store = new MemoryStore();
  server = http.createServer(createApp(store));
  server.listen(0, done); // listen on a random free port
});

afterEach((done) => {
  server.close(done);
});

// ---- helpers ----

function event(
  event_id: string,
  station_id: string,
  status: string,
  amount: number,
  created_at = '2026-02-19T10:00:00Z',
) {
  return { event_id, station_id, amount, status, created_at };
}

function batch(...events: object[]) {
  return { events };
}

// ---- Test 1: batch insert returns correct inserted/duplicates counts ----

test('batch insert — correct inserted and duplicates counts', async () => {
  // First insert: all 3 are new.
  const res1 = await request(server).post('/transfers').send(
    batch(
      event('e1', 'S1', 'approved', 100),
      event('e2', 'S1', 'approved', 50),
      event('e3', 'S2', 'pending', 30),
    ),
  );
  expect(res1.status).toBe(200);
  expect(res1.body).toEqual({ inserted: 3, duplicates: 0 });

  // Second insert: all 3 are duplicates.
  const res2 = await request(server).post('/transfers').send(
    batch(
      event('e1', 'S1', 'approved', 100),
      event('e2', 'S1', 'approved', 50),
      event('e3', 'S2', 'pending', 30),
    ),
  );
  expect(res2.status).toBe(200);
  expect(res2.body).toEqual({ inserted: 0, duplicates: 3 });
});

// ---- Test 2: duplicate event does not change totals ----

test('duplicate event does not inflate totals', async () => {
  await request(server).post('/transfers').send(batch(event('e1', 'S1', 'approved', 200)));
  await request(server).post('/transfers').send(batch(event('e1', 'S1', 'approved', 200))); // dup

  const res = await request(server).get('/stations/S1/summary');
  expect(res.status).toBe(200);
  expect(res.body.total_approved_amount).toBe(200);
  expect(res.body.events_count).toBe(1);
});

// ---- Test 3: out-of-order arrival produces the same totals ----

test('out-of-order arrival produces correct totals', async () => {
  // Newer event arrives first.
  await request(server)
    .post('/transfers')
    .send(batch(event('e-new', 'S1', 'approved', 75, '2026-02-20T10:00:00Z')));

  // Older event arrives second.
  await request(server)
    .post('/transfers')
    .send(batch(event('e-old', 'S1', 'approved', 25, '2026-02-18T10:00:00Z')));

  const res = await request(server).get('/stations/S1/summary');
  expect(res.body.total_approved_amount).toBe(100);
  expect(res.body.events_count).toBe(2);
});

// ---- Test 4: concurrent ingestion of same event_id does not double-count ----

test('concurrent requests with the same event_id do not double-insert', async () => {
  // 50 concurrent requests all carrying the same event_id.
  const requests = Array.from({ length: 50 }, () =>
    request(server)
      .post('/transfers')
      .send(batch(event('shared-event', 'S1', 'approved', 500))),
  );

  const results = await Promise.all(requests);

  const totalInserted = results.reduce((sum, r) => sum + (r.body.inserted ?? 0), 0);
  expect(totalInserted).toBe(1); // exactly one insertion across all concurrent calls

  const summary = await request(server).get('/stations/S1/summary');
  expect(summary.body.total_approved_amount).toBe(500);
  expect(summary.body.events_count).toBe(1);
});

// ---- Test 5: summary endpoint — correct per-station totals ----

test('summary endpoint returns correct totals per station', async () => {
  await request(server).post('/transfers').send(
    batch(
      event('e1', 'S1', 'approved', 100),
      event('e2', 'S1', 'approved', 50),
      event('e3', 'S1', 'rejected', 999), // stored but must not contribute to total
      event('e4', 'S2', 'approved', 200),
    ),
  );

  const s1 = await request(server).get('/stations/S1/summary');
  expect(s1.body).toEqual({
    station_id: 'S1',
    total_approved_amount: 150,
    events_count: 3, // all statuses counted
  });

  const s2 = await request(server).get('/stations/S2/summary');
  expect(s2.body).toEqual({
    station_id: 'S2',
    total_approved_amount: 200,
    events_count: 1,
  });
});

// ---- Test 6: non-approved statuses do not contribute to amount total ----

test('non-approved statuses do not contribute to total_approved_amount', async () => {
  await request(server).post('/transfers').send(
    batch(
      event('e1', 'S1', 'pending', 500),
      event('e2', 'S1', 'rejected', 300),
      event('e3', 'S1', 'unknown-status', 999),
    ),
  );

  const res = await request(server).get('/stations/S1/summary');
  expect(res.body.total_approved_amount).toBe(0);
  expect(res.body.events_count).toBe(3);
});

// ---- Test 7: validation failure (fail-fast strategy) ----

test('validation — missing required fields return 400', async () => {
  const cases = [
    {
      name: 'missing event_id',
      body: batch({ station_id: 'S1', amount: 10, status: 'approved', created_at: '2026-02-19T10:00:00Z' }),
    },
    {
      name: 'missing station_id',
      body: batch({ event_id: 'e1', amount: 10, status: 'approved', created_at: '2026-02-19T10:00:00Z' }),
    },
    {
      name: 'negative amount',
      body: batch({ event_id: 'e1', station_id: 'S1', amount: -5, status: 'approved', created_at: '2026-02-19T10:00:00Z' }),
    },
    {
      name: 'invalid created_at',
      body: batch({ event_id: 'e1', station_id: 'S1', amount: 10, status: 'approved', created_at: 'not-a-date' }),
    },
    {
      name: 'missing events field',
      body: { data: [] },
    },
  ];

  for (const tc of cases) {
    const res = await request(server).post('/transfers').send(tc.body);
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  }
});

// ---- Test 8: mixed batch — partial duplicates ----

test('mixed batch returns correct split between inserted and duplicates', async () => {
  const r1 = await request(server).post('/transfers').send(
    batch(event('e1', 'S1', 'approved', 10), event('e2', 'S1', 'approved', 20)),
  );
  expect(r1.body).toEqual({ inserted: 2, duplicates: 0 });

  const res = await request(server).post('/transfers').send(
    batch(
      event('e1', 'S1', 'approved', 10), // dup
      event('e3', 'S1', 'approved', 30), // new
      event('e4', 'S1', 'approved', 40), // new
    ),
  );
  expect(res.body).toEqual({ inserted: 2, duplicates: 1 });
});
