# Petro Transfer Ingestion API

Idempotent ingestion and per-station reconciliation of transfer events.

## Tech stack

| Concern | Choice |
|---|---|
| Language | TypeScript (Node.js 20) |
| HTTP framework | Express 4 |
| Validation | Zod |
| Storage | In-memory (`Map`) |
| Tests | Jest + Supertest |
| Container | Docker multi-stage |

---

## Requirements

**Docker (no local Node.js needed)**
- Docker Engine ≥ 24
- Docker Compose ≥ v2

**Local**
- Node.js 20+
- npm 10+

---

## How to run

### Docker

```bash
# Build image and start server on :8080
docker compose up --build

# Run tests in an isolated container
docker compose --profile test run --rm test
# or via make:
make docker-test
```

### Local

```bash
npm install          # install dependencies  (make install)
npm run dev          # start with ts-node    (make dev)
npm run build && npm start   # compiled start (make run)
npm test             # run test suite        (make test)
```

Override the port:
```bash
PORT=9090 npm run dev
```

---

## How to run tests

```bash
# local
npm test             # or: make test

# docker
make docker-test     # or: docker compose --profile test run --rm test
```

---

## API examples (curl)

### POST /transfers

```bash
curl -s -X POST http://localhost:8080/transfers \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "event_id": "evt-001",
        "station_id": "S1",
        "amount": 100.50,
        "status": "approved",
        "created_at": "2026-02-19T10:00:00Z"
      },
      {
        "event_id": "evt-002",
        "station_id": "S1",
        "amount": 50.00,
        "status": "pending",
        "created_at": "2026-02-19T11:00:00Z"
      }
    ]
  }'
```

Response:
```json
{"inserted":2,"duplicates":0}
```

Send the same payload again:
```json
{"inserted":0,"duplicates":2}
```

### GET /stations/:station_id/summary

```bash
curl -s http://localhost:8080/stations/S1/summary
```

Response:
```json
{
  "station_id": "S1",
  "total_approved_amount": 100.5,
  "events_count": 2
}
```

`evt-002` is counted in `events_count` (all statuses) but excluded from
`total_approved_amount` because its `status` is `"pending"`.

---

## Design notes

### Idempotency strategy

Every `TransferEvent` has a globally unique `event_id`.  
The store keeps a `Map<string, TransferEvent>` keyed by `event_id`. On every
`insertEvents` call each event is checked via `Map.has(event_id)` before being
stored. If the key already exists the event is counted as a duplicate and
**skipped** — the stored copy is never overwritten.

### Concurrency strategy (Node.js single-thread guarantee)

Node.js executes JavaScript on a single thread with a cooperative event loop.
A synchronous block cannot be interleaved with another request handler unless
it explicitly yields (`await`, I/O callback, etc.). Because `insertEvents` and
`getStationSummary` are **fully synchronous** (no `await`), they are atomic
with respect to concurrent HTTP requests.

Two requests arriving at the same millisecond are queued on the event loop and
executed one after the other. Whichever runs second finds the `event_id` already
in the `Map` and records it as a duplicate — no race condition is possible.

> **Scaling note:** This guarantee holds for a single process. Running multiple
> worker processes (cluster mode, Kubernetes pods) would require an external
> store (e.g. Redis `SET NX`, Postgres `INSERT … ON CONFLICT DO NOTHING`) to
> enforce the uniqueness constraint across processes. The `IStore` interface is
> the swap point for that migration.

### Validation strategy: fail-fast

If *any* event in the batch fails validation the whole request is rejected with
HTTP 400 and **nothing** is stored. Rationale:

- The caller always knows whether their batch landed or not — no partial state
  to reconcile.
- Retrying a corrected batch is safe: already-stored events appear as
  `duplicates`, not errors.

### `events_count` definition

`events_count` counts **all** stored events for a station regardless of status.
Only `total_approved_amount` is filtered to `status === "approved"`. Operators
can see total ingestion volume independently from the financial total.

### Tradeoffs of in-memory storage

| Pro | Con |
|---|---|
| Zero dependencies, fast | State lost on restart |
| Atomic within single process | Does not scale across processes |
| Trivial to test | No persistence guarantee |
