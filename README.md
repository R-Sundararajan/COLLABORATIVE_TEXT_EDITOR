# Collaborative Text Editor

A functional collaborative text editor built with React, Node.js, PostgreSQL,
Redis, and WebSockets. The project is being implemented in phases, with each
phase adding one complete slice of the system before moving to the next.

Current completed scope covers project initialization, database design,
authentication, document CRUD, authenticated WebSocket collaboration,
revision-based operational transform, Redis-backed active state, durable
PostgreSQL synchronization, and the complete collaborative editor frontend.

## Completed Phases

### Phase 1 - Project Initialization

- React frontend shell created with Vite
- Express backend scaffold created
- PostgreSQL and Redis local services defined with Docker Compose
- Backend configuration modules added for PostgreSQL and Redis
- Old Mongo/Mongoose auth/project files removed

### Phase 2 - Database Design

- PostgreSQL migration runner added
- Initial schema added for users, documents, document permissions, and document
  metadata
- UUID primary keys, JSONB metadata, timestamp triggers, constraints, and lookup
  indexes included

### Phase 3 - Authentication & API Gateway

- User registration and login endpoints added
- Passwords hashed with Node.js `scrypt`
- JWT access tokens signed and verified with HMAC SHA-256
- Protected session/user routes added
- Centralized `/api` gateway routing added
- Production startup now requires `JWT_SECRET`

### Phase 4 - CRUD Document Service

- Authenticated create, list, read, update, save, and archive routes added
- Owner/editor write permissions enforced through PostgreSQL
- Document content versions and text statistics maintained on writes

### Phase 5 - WebSocket Collaboration

- Authenticated WebSocket endpoint available at `/ws`
- Permission-aware document rooms and participant counts added
- Validated edit operations broadcast to other room members
- Typed frontend collaboration client and local Vite WebSocket proxy added

### Phase 6 - Operational Transform

- Active document rooms maintain authoritative content and revision state
- Stale edits transform through bounded accepted-operation history
- Same-position inserts, overlapping deletes, and replacement conflicts resolve
  in deterministic server order
- Duplicate operation delivery is idempotent and invalid revision/range errors
  are explicit
- WebSocket joins, acknowledgements, and broadcasts expose synchronized
  revisions and transformed operations

### Phase 7 - Redis Integration

- Active document content and revisions are cached in Redis with a sliding TTL
- Room creation reads through the cache after PostgreSQL permission checks
- Cache misses and stale entries fall back to PostgreSQL and repopulate Redis
- Accepted edits update Redis before they are broadcast to other participants
- Redis failures degrade to the existing in-memory room state

### Phase 8 - PostgreSQL Persistence

- Accepted collaboration edits are coalesced into revision-aware PostgreSQL
  state writes
- Persistent writes update document content, version, timestamps, and text
  statistics transactionally
- Redis state ahead of PostgreSQL repairs the durable record when a room opens
- Temporary write failures retry, while inactive rooms and orderly shutdowns
  flush pending state immediately

### Phase 9 - Frontend Editor

- Registration, login, persisted sessions, and logout are available in the UI
- Account settings support verified display-name, email, and password updates
- Document creation, listing, title editing, archiving, direct invitations, and
  share-code joining are wired to the authenticated API
- The responsive rich-text editor joins live document rooms, provides text and
  alignment controls, and applies revisioned local and remote operations
- Owner/editor and viewer permissions control whether the document is editable
- Light and dark themes persist across reloads

## API Surface

The backend currently exposes:

- `GET /` - service status
- `GET /health` - process health
- `GET /health/dependencies` - PostgreSQL and Redis dependency checks
- `GET /api` - API gateway route index
- `POST /api/auth/register` - create a user and return a bearer token
- `POST /api/auth/login` - authenticate a user and return a bearer token
- `GET /api/auth/session` - validate the current bearer token
- `GET /api/auth/me` - return the authenticated user
- `PATCH /api/auth/me` - update account details after password verification
- `GET /api/documents` - list documents available to the authenticated user
- `POST /api/documents` - create a document
- `POST /api/documents/join` - join a document using a share code
- `GET /api/documents/:documentId` - read a document
- `GET /api/documents/:documentId/members` - list document members as owner
- `POST /api/documents/:documentId/share` - invite an account by email
- `POST /api/documents/:documentId/share-link` - create a role-scoped share code
- `PATCH /api/documents/:documentId` - update a document
- `PUT /api/documents/:documentId/save` - save editor content
- `DELETE /api/documents/:documentId` - archive a document
- `WS /ws` - authenticate, join document rooms, and exchange transformed,
  revisioned live edits

## Development

Start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

Backend:

```bash
cd backend
npm install
npm run dev
```

Apply database migrations:

```bash
cd backend
npm run migrate
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend environment variables are documented in `backend/.env.example`.
`ACTIVE_DOCUMENT_CACHE_TTL_SECONDS` controls how long inactive document state
remains cached and defaults to 24 hours.
`DOCUMENT_PERSIST_DEBOUNCE_MS` controls edit coalescing before PostgreSQL writes,
and `DOCUMENT_PERSIST_RETRY_MS` controls retries after temporary write failures.

Run `npm run test:access` in `backend` to verify direct invitations, share-code
joining, role enforcement, member visibility, and authenticated profile updates.
