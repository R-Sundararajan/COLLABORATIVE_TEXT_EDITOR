# Collaborative Text Editor

Fresh scaffold for a collaborative text editor using React, Node.js, PostgreSQL,
Redis, and WebSockets.

Progress is tracked in `PROJECT_PROGRESS.md`. Each session should continue from
the first unfinished phase only.

## Implemented Scope

- Frontend shell initialized with React and Vite
- Backend initialized with Express
- PostgreSQL and Redis development services defined
- Backend configuration modules created for PostgreSQL and Redis
- PostgreSQL migration runner added
- Initial schema for users, documents, document permissions, and document metadata
- Old Mongo/Mongoose auth/project source removed

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
