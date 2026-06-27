# Backend

The backend is one Node.js process that serves the Express HTTP API and the `/ws` collaboration endpoint. It owns authentication, document access, realtime room state, Redis cache access, and PostgreSQL persistence.

## Structure

```text
backend/
|-- server.js                  # Process entry point and graceful shutdown
|-- src/
|   |-- config/                # Environment and shared data clients
|   |-- db/                    # SQL migrations and runner
|   |-- http/                  # Express composition and API gateway
|   |-- modules/               # Auth, documents, collaboration, OT
|   `-- queue/                 # Status note: no external queue is implemented
|-- .env.example
`-- package.json
```

See the [source map](src/README.md) for folder-level responsibilities.

## Startup flow

1. `server.js` imports the validated environment and creates the Express app.
2. A Node HTTP server wraps the app.
3. `attachCollaborationServer()` registers the HTTP upgrade listener and WebSocket heartbeat.
4. The HTTP server listens on `PORT`.
5. PostgreSQL and Redis connect lazily on first use.

Migrations are not part of server startup. Run `npm run migrate` before `npm start` against a new or updated database.

On `SIGINT` or `SIGTERM`, the collaboration server terminates sockets and flushes pending document state, the HTTP listener closes, and PostgreSQL/Redis clients close.

## Runtime dependencies

| Package | Use |
| --- | --- |
| `express` | HTTP routing and middleware |
| `cors` | Configured browser origin policy |
| `dotenv` | Local environment loading |
| `pg` | PostgreSQL pool, transactions, and queries |
| `redis` | Active-document cache client |
| `ws` | WebSocket upgrade, frames, and heartbeat |

Authentication cryptography, HTTP server creation, timers, migration file access, and assertions use Node.js built-ins.

## Commands

```bash
npm run dev       # node --watch server.js
npm start         # production-style process start
npm run migrate   # apply verified SQL migrations
npm run check     # load core modules
npm test          # run all six backend test scripts
```

`npm test` includes PostgreSQL-backed CRUD/access tests. Configure `DATABASE_URL` and start the database before running the full suite.

## Configuration

Copy `.env.example` to `.env`. `JWT_SECRET` must be explicitly set in production. Cache/persistence timing values accept only positive integers and otherwise use source defaults.

See [configuration](src/config/README.md), [database](src/db/README.md), and the [engineering workflow](../WORKFLOW.md).

## Interfaces

- HTTP endpoint summary: [root README](../README.md#api-overview)
- HTTP composition: [src/http/README.md](src/http/README.md)
- WebSocket protocol: [src/modules/collaboration/README.md](src/modules/collaboration/README.md)
- Data consistency: [WORKFLOW.md](../WORKFLOW.md#consistency-and-recovery-model)

## Boundaries

The backend is not a distributed gateway and does not serve the compiled frontend. In-memory rooms, per-client message chains, and persistence timers belong to this process. A multi-instance deployment requires document affinity and cross-instance realtime coordination.
