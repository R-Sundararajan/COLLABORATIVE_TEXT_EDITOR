# Documents Module

Phase 4 document CRUD is exposed through authenticated `/api/documents` routes.

- `GET /api/documents` lists active documents accessible to the current user.
- `POST /api/documents` creates a document and grants owner permission.
- `GET /api/documents/:documentId` reads one accessible active document.
- `PATCH /api/documents/:documentId` updates title, content, and metadata.
- `PUT /api/documents/:documentId/save` saves editor content and updates stats.
- `DELETE /api/documents/:documentId` archives an owned document.

## Collaborative state persistence

Accepted WebSocket edits are coalesced per document and written to the same
`documents.content` and `documents.version` fields used by the HTTP API. Writes
run in a transaction, update document statistics, and ignore states older than
the revision already stored in PostgreSQL.

The persistence coordinator flushes after a short configurable debounce,
retries temporary failures, and drains pending documents when the final room
member leaves or the server shuts down. This keeps per-keystroke database load
bounded without leaving inactive document state only in memory.
