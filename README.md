# Collaborative Text Editor

A functional collaborative text editor built with React, Node.js, PostgreSQL,
Redis, and WebSockets. The project is being implemented in phases, with each
phase adding one complete slice of the system before moving to the next.

Current completed scope covers project initialization, database design,
authentication, document CRUD, authenticated WebSocket collaboration, and
revision-based operational transform.

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
- `GET /api/documents` - list documents available to the authenticated user
- `POST /api/documents` - create a document
- `GET /api/documents/:documentId` - read a document
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
