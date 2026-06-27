# Architecture and Verification Metrics

This file records static measurements of the implemented repository. Counts exclude `node_modules`, build output, logs, caches, generated files, lockfile contents, Markdown, the ignored Draw.io artifact, and local secret environment files unless a row explicitly says otherwise.

## Implementation footprint

| Metric | Count |
| --- | ---: |
| Code/config source files (`.js`, `.ts`, `.tsx`, `.css`, `.sql`, `.html`) | 38 |
| Physical source lines after documentation comments | 8,845 |
| Nonblank source lines after documentation comments | 7,656 |
| Backend production JavaScript files | 22 |
| Backend test files | 6 |
| Frontend TypeScript/TSX implementation and build-config files | 5 |
| Stylesheets | 2 |
| SQL migrations | 1 |

## Documentation coverage

| Metric | Count |
| --- | ---: |
| Architecture/module Markdown files delivered or expanded | 18 |
| README files across documented repository/module boundaries | 16 |
| Rendered SVG diagrams with editable Mermaid sources | 2 |
| Mutable code/config source files with concise headers | 37/37 (100%) |
| Significant existing source folders without a README | 0 |

The 18-file documentation set excludes the ignored project progress tracker. The checksum-managed, already-applied SQL migration intentionally remains byte-stable instead of receiving an inline header; its contract is documented in `backend/src/db/README.md`. No READMEs were added to empty asset/public folders or the single-file migrations folder; their responsibilities are covered by the nearest logical module guide.

## Runtime surface

| Metric | Count | Notes |
| --- | ---: | --- |
| HTTP endpoints | 19 | 3 service/health, 1 gateway index, 5 authentication, 10 document |
| Authenticated document endpoints | 10 | The document router applies auth globally |
| Client-to-server WebSocket message types | 4 | authenticate, join, leave, edit |
| Server-to-client WebSocket message types | 8 | connected, authenticated, joined, left, presence, accepted edit, remote edit, error |
| Document permission roles | 3 | owner, editor, viewer |
| OT operations retained per active room | 1,000 | Default hard bound in `DocumentOperationState` |
| Maximum WebSocket frame | 64 KiB | `ws` server `maxPayload` |
| Maximum inserted text per edit | 50,000 JavaScript characters | Protocol validation |
| Authentication timeout | 10 seconds | Unauthenticated WebSocket is closed |
| Heartbeat interval | 30 seconds | Nonresponsive sockets are terminated |

## Data layer

| Metric | Count | Notes |
| --- | ---: | --- |
| Runtime PostgreSQL tables | 5 | 4 application tables plus `schema_migrations` |
| Application indexes | 9 | Excludes primary-key/unique constraint backing indexes |
| Timestamp triggers | 4 | One per application table |
| PostgreSQL extensions | 2 | `pgcrypto`, `citext` |
| Redis key families | 1 | `collab:active-document:<documentId>` |
| Redis cache schema version | 2 | Validated in every read |
| Default cache TTL | 86,400 seconds | Sliding via `GETEX` and renewed via `SET` |
| Default persistence debounce | 1,000 ms | Per dirty document |
| Default persistence retry delay | 5,000 ms | Installed after failed flush |

## Dependencies

| Metric | Count |
| --- | ---: |
| Direct backend runtime dependencies | 6 |
| Backend lockfile package entries | 94 |
| Direct frontend runtime dependencies | 2 |
| Direct frontend development dependencies | 12 |
| Frontend lockfile package entries | 228 |

Direct backend dependencies are `cors`, `dotenv`, `express`, `pg`, `redis`, and `ws`. The frontend runtime dependencies are `react` and `react-dom`; its build/lint chain is Vite, TypeScript, ESLint, and React-specific plugins/types.

## Test inventory

| Metric | Count | Notes |
| --- | ---: | --- |
| Backend test files | 6 | All are executable Node scripts |
| Static `assert.*` calls | 111 | Simple source occurrence count, not a test-case count |
| Test domains | 6 | OT, Redis cache, persistence, WebSocket, CRUD, access/account |
| Frontend stored automated test files | 0 | Lint/build are the repository's frontend checks |

Database-backed test scripts apply migrations and use the configured PostgreSQL instance. Redis and WebSocket cache behavior are tested with injected fakes, so the full backend suite requires PostgreSQL but does not require live Redis for every test.

## Final verification commands

```bash
cd backend
npm run check
npm test

cd ../frontend
npm run lint
npm run build

git diff --check
```

## Measurement method

- File inventory: `rg --files` with dependency/build/cache exclusions.
- Endpoint count: Express route declarations in `app.js`, `apiGateway.js`, `auth/routes.js`, and `documents/routes.js`.
- Protocol count: accepted client cases in `protocol.js` and the typed server-message union in the frontend client.
- Database count: migration DDL plus the migration runner's `schema_migrations` DDL.
- Assertion count: occurrences of `assert.<method>` in `*.test.js`.
- Dependency entries: `packages` keys in npm lockfile v3 data.
- Source lines: physical and nonblank line counts after the final header/comment pass.
- Header coverage: first-line block/HTML documentation audit across all 37 mutable source/config files; the immutable SQL migration is audited separately against its stored checksum.

Related: [project overview](README.md), [engineering workflow](WORKFLOW.md), [test scripts](backend/package.json).
