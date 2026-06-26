# Collaborative Text Editor

A functional collaborative text editor built with React, Node.js, PostgreSQL,
Redis, and WebSockets. The project is being implemented in phases, with each
phase adding one complete slice of the system before moving to the next.

Current completed scope covers project initialization, database design, and the
authentication/API gateway layer.

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
Progress and phase status are tracked in `PROJECT_PROGRESS.md`.
