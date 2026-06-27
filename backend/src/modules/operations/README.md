# Operations Module

This module owns the in-memory operational transform state for each active
document room.

Every edit is a UTF-16 string splice with an `index`, `deleteCount`, and
`insertText`. A client submits the document revision on which that splice was
created. The server transforms a stale edit through every accepted operation
after that base revision, applies the transformed edit, increments the
authoritative revision, and broadcasts the accepted operation.

Conflicts are resolved in server arrival order. Concurrent inserts at the same
position retain that order. Inserts inside a concurrently deleted range are
deleted with the range, while inserts exactly at a range boundary survive.
Overlapping deletes collapse to the remaining live range.

Operation history and idempotency records are bounded to 1,000 edits per active
room. A client older than the retained history receives `REVISION_TOO_OLD` and
must rejoin to obtain the current content and revision. Reusing an accepted
`clientOperationId` returns the original acknowledgement without applying the
edit twice; reusing it for different content is rejected.

The transformation history is intentionally scoped to an active room. Current
content and revision state are cached in Redis and coalesced into durable
PostgreSQL writes, so recovery does not depend on retaining the in-memory
operation history.
