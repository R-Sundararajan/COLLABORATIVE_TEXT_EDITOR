# Documents Module

Phase 4 document CRUD is exposed through authenticated `/api/documents` routes.

- `GET /api/documents` lists active documents accessible to the current user.
- `POST /api/documents` creates a document and grants owner permission.
- `GET /api/documents/:documentId` reads one accessible active document.
- `PATCH /api/documents/:documentId` updates title, content, and metadata.
- `PUT /api/documents/:documentId/save` saves editor content and updates stats.
- `DELETE /api/documents/:documentId` archives an owned document.
