# Database and Migrations

This folder owns schema evolution, not application queries. Domain SQL lives in the auth and document repositories.

## Structure

```text
db/
|-- migrate.js
`-- migrations/
    `-- 001_initial_schema.sql
```

## Migration runner

`migrate.js` exports `MIGRATIONS_DIR`, `loadMigrations`, and `runMigrations` and also acts as the `npm run migrate` CLI.

The runner:

1. accepts only filenames shaped like `001_descriptive_name.sql`;
2. reads files, calculates SHA-256 checksums, sorts numeric IDs, and rejects duplicates;
3. creates `schema_migrations` when absent;
4. verifies applied ID/name/checksum consistency;
5. applies each new SQL file and tracking row in one transaction.

Changing an applied migration is treated as an error. Add a new numbered migration instead.

## Schema

| Table | Key relationships and behavior |
| --- | --- |
| `schema_migrations` | Migration ID primary key; unique filename and checksum |
| `users` | UUID primary key; active case-insensitive email uniqueness; optional soft deletion |
| `documents` | Owner references users; full content and monotonic version; optional archive time |
| `document_permissions` | Composite document/user primary key; role check; cascading membership deletion |
| `document_metadata` | One-to-one document statistics; optional last-editor reference |

The migration enables `pgcrypto` for generated UUIDs and `citext` for email comparison. It creates JSON-object and non-negative-count constraints, nine explicit application indexes, and a shared trigger function that maintains `updated_at` on all four application tables.

## Query ownership

- [Authentication repository](../modules/auth/README.md) reads/writes `users`.
- [Documents repository](../modules/documents/README.md) reads/writes documents, permissions, metadata, and related user fields.
- [Persistence coordinator](../modules/documents/README.md#realtime-persistence) delegates revision-guarded writes to the document repository.

## Operational notes

Migrations do not run at normal server startup. Database-backed tests call `runMigrations()` before exercising routes. The SQL uses `create extension if not exists`, but tables/triggers are initial-creation DDL rather than rerunnable `if not exists` statements; migration tracking prevents a second application.

Related: [configuration](../config/README.md), [backend guide](../../README.md), [database overview](../../../README.md#database-overview).
