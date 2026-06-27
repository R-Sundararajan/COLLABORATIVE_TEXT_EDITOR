# Queue Status

No external message queue or background worker is implemented. This folder contains documentation only and is not imported at runtime.

The current backend has two in-process ordering mechanisms:

- a Promise chain on each WebSocket client serializes that client's messages;
- `DocumentStatePersistence` coalesces the latest full state per document and flushes it on timers, room inactivity, or shutdown.

These records are not durable jobs. Redis preserves the latest accepted full document state for recovery, and PostgreSQL is the durable destination. Introducing a broker would require explicit delivery, idempotency, revision ordering, and shutdown ownership rules; none should be inferred from the current folder name.

Related: [collaboration message routing](../modules/collaboration/README.md), [document persistence](../modules/documents/README.md#realtime-persistence), [background queue workflow](../../../WORKFLOW.md#background-queue-status).
